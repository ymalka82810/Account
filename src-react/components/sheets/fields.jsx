export const codeProps = { type: 'text', inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code', placeholder: '6 ספרות', dir: 'ltr' };
export const pinProps = (ac) => ({ type: 'password', inputMode: 'numeric', maxLength: 4, autoComplete: ac });
export const Err = ({ children }) => <p className="error" role="alert">{children}</p>;
export const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
