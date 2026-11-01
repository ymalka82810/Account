import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { useSheet } from '../shared/Sheet.jsx';
import { roleLabel } from '../../lib/computations.js';
import { useNotebook } from '../../lib/notebook.js';
import PersonForm from './PersonForm.jsx';
import { NotebookMergeSheet, findNotebookMatches } from './NotebookMerge.jsx';

// נפתח אוטומטית מיד אחרי הקמת משפחה: מוסיפים את בני המשפחה עכשיו, בלי לחפש איפה עושים את זה.
// בסיום, אם יש בפנקס האישי שמות שמתאימים לבני המשפחה, עוברים לשאלת האיחוד.
export default function FamilyWelcome() {
  const { data, token, me } = useApp();
  const nb = useNotebook();
  const sheet = useSheet();
  const others = data.people.filter((p) => p.id !== me);
  const done = () => {
    if (findNotebookMatches(nb, data.people, me).length) sheet.open(t('איחוד עם הפנקס'), <NotebookMergeSheet />);
    else sheet.close();
  };
  return (
    <div>
      <p className="hint">{t('הקופה נפתחה! נוסיף עכשיו את בני המשפחה: ילדים, בני נוער והורה נוסף. אפשר גם אחר כך, מלשונית “ניהול”.')}</p>
      {others.length > 0 && (
        <div className="list">
          {others.map((p) => (
            <div className="person" key={p.id}>
              {p.avatar && <span className="avatar-md" aria-hidden="true">{p.avatar}</span>}
              <div className="text">{p.name} <span className="meta">{roleLabel(p.role, p.gender)}</span></div>
            </div>
          ))}
        </div>
      )}
      <PersonForm token={token} />
      <button className="primary" type="button" onClick={done}>{others.length ? t('סיימתי') : t('אוסיף אחר כך')}</button>
    </div>
  );
}
