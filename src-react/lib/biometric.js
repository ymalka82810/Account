// אימות בטביעת אצבע / זיהוי פנים לפעולות רגישות של הורה (שינוי תפקיד).
// באפליקציה (APK): הפלאגין BiometricAuth (מפתח ב-Android Keystore + BiometricPrompt).
// באתר: WebAuthn עם המאמת של המכשיר עצמו (Touch ID, Face ID, Windows Hello, טביעת אצבע באנדרואיד).
// השרת (convex/biometric.ts) בודק את החתימה, כך שאי אפשר לדלג על השלב הזה מהדפדפן.
import { call } from './api.js';
import { isNativeApp } from './updater.js';
import { t } from '../i18n/index.js';

const cap = window.Capacitor;
const native = (method, options) => cap.nativePromise('BiometricAuth', method, options);
const LOCAL_KEY = (personId) => 'bio-cred:' + personId;

const hexToBytes = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const toB64url = (buf) => toB64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
};

export class BioError extends Error {
  // code: 'unsupported' | 'cancel' | 'failed' | 'needSetup'
  constructor(code, message) { super(message); this.code = code; }
}

export async function bioSupported() {
  if (isNativeApp) {
    try { return !!(await native('isAvailable')).available; } catch (e) { return false; }
  }
  try {
    return !!window.PublicKeyCredential
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) { return false; }
}

// האם המכשיר הזה כבר רשום לאימות של ההורה הזה.
export const bioReady = (personId) => { try { return !!localStorage.getItem(LOCAL_KEY(personId)); } catch (e) { return false; } };
export const bioForgetLocal = (personId) => { try { localStorage.removeItem(LOCAL_KEY(personId)); } catch (e) { /* */ } };

const nativeAlias = (personId) => 'account-bio-' + personId;
const isCancel = (e) => e && (e.name === 'NotAllowedError' || e.name === 'AbortError' || e.message === 'cancel');

// רישום המכשיר (פעם אחת לכל מכשיר). דורש את הקוד הסודי של ההורה.
// מחזיר {ok:true} או {ok:false, reason:'wrong'|'locked'|'nopin'}.
export async function bioRegister(token, myPin) {
  const start = await call('biometric:registerStart', { token, myPin });
  if (!start.ok) return start;
  const { challenge, userId, name } = start;
  try {
    if (isNativeApp) {
      const alias = nativeAlias(userId);
      const { publicKey } = await native('register', { alias });
      const { signature } = await native('sign', {
        alias, message: 'account-bio:' + challenge,
        title: t('רישום זיהוי פנים / טביעת אצבע'), subtitle: t('לאישור פעולות רגישות בקופה'),
      });
      await call('biometric:registerFinish', {
        token, challenge, kind: 'android', credentialId: alias, publicKey, alg: -7, signature, label: 'אפליקציה',
      });
      localStorage.setItem(LOCAL_KEY(userId), alias);
    } else {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: hexToBytes(challenge),
          rp: { name: t('הקופה המשפחתית'), id: location.hostname },
          user: { id: new TextEncoder().encode(userId), name, displayName: name },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          attestation: 'none',
          timeout: 60000,
        },
      });
      const r = /** @type {AuthenticatorAttestationResponse} */ (/** @type {PublicKeyCredential} */ (cred).response);
      if (typeof r.getPublicKey !== 'function' || !r.getPublicKey()) {
        throw new BioError('unsupported', t('הדפדפן הזה ישן מדי לאימות ביומטרי. עדכנו אותו ונסו שוב.'));
      }
      const credentialId = toB64url(/** @type {PublicKeyCredential} */ (cred).rawId);
      await call('biometric:registerFinish', {
        token, challenge, kind: 'webauthn', credentialId,
        publicKey: toB64(r.getPublicKey()), alg: r.getPublicKeyAlgorithm(),
        clientDataJSON: toB64url(r.clientDataJSON), label: 'דפדפן',
      });
      localStorage.setItem(LOCAL_KEY(userId), credentialId);
    }
  } catch (e) {
    if (e instanceof BioError) throw e;
    if (isCancel(e)) throw new BioError('cancel', t('האימות בוטל'));
    if (e && typeof e.data === 'string') throw e; // שגיאה מהשרת
    throw new BioError('failed', t('לא הצלחנו לרשום את המכשיר. נסו שוב.'));
  }
  return { ok: true };
}

// אישור פעולה: מבקש אתגר מהשרת, מפעיל טביעת אצבע / זיהוי פנים, ומחזיר proof
// שמצרפים לקריאה עצמה (למשל people:setRole). action חייב להתאים בדיוק למה שהשרת מצפה.
export async function bioProve(token, personId, action, title = t('אישור שינוי תפקיד')) {
  const credentialId = localStorage.getItem(LOCAL_KEY(personId));
  if (!credentialId) throw new BioError('needSetup', t('צריך לרשום את המכשיר'));
  const res = await call('biometric:challenge', { token, action, credentialId });
  if (!res.ok) { bioForgetLocal(personId); throw new BioError('needSetup', t('צריך לרשום את המכשיר מחדש')); }
  const { challenge } = res;
  try {
    if (isNativeApp) {
      const { signature } = await native('sign', {
        alias: credentialId, message: 'account-bio:' + challenge,
        title, subtitle: t('זיהוי פנים או טביעת אצבע'),
      });
      return { challenge, credentialId, signature };
    }
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: hexToBytes(challenge),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromB64url(credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    const r = /** @type {AuthenticatorAssertionResponse} */ (/** @type {PublicKeyCredential} */ (cred).response);
    return {
      challenge, credentialId,
      signature: toB64url(r.signature),
      clientDataJSON: toB64url(r.clientDataJSON),
      authenticatorData: toB64url(r.authenticatorData),
    };
  } catch (e) {
    if (isCancel(e)) throw new BioError('cancel', t('האימות בוטל'));
    // באפליקציה: מפתח מהגרסה הקודמת (רק טביעת אצבע) או מפתח שנמחק - נרשמים מחדש.
    if (e && (e.message === 'invalidated' || e.message === 'nokey')) {
      bioForgetLocal(personId);
      throw new BioError('needSetup', t('צריך לרשום את המכשיר מחדש כדי לאפשר גם זיהוי פנים'));
    }
    throw new BioError('failed', t('האימות לא הצליח. נסו שוב.'));
  }
}
