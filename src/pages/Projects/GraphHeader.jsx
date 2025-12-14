import { useEffect, useRef, useState } from 'react';
import styles from './ProjectAnalysis.module.css';
import { useI18n } from '../../context/I18nContext';

export default function GraphHeader({
  title = 'Project Architecture',
  nodesCount = 0,
  edgesCount = 0,
  requirementsCount = 0,
  endpointsCount = 0,
  onClose,
  closeLabel = 'Close',
  onDelete,
  deleteLabel = 'Delete',
  deleteIcon,
  deleting = false,
  renderComplete = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const { t } = useI18n();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDeleteClick = () => {
    setMenuOpen(false);
    onDelete?.();
  };

  return (
    <div className={styles.graphHeader}>
      <div className={styles.graphHeaderLeft}>
        <h2 className={styles.graphTitle}>{title}</h2>
        <div className={styles.graphMeta}>
          {t(
            'graph.meta',
            `Узлы: ${nodesCount} | Рёбра: ${edgesCount} | Зависимости: ${requirementsCount} | Эндпоинты: ${endpointsCount}`,
            { nodes: nodesCount, edges: edgesCount, requirements: requirementsCount, endpoints: endpointsCount }
          )}
        </div>
        {renderComplete && (
          <div className={styles.renderDone} role="status" aria-live="polite">
            <span className={styles.renderDoneDot} aria-hidden="true" />
            {t('graph.rendered', 'Отрисовка закончена')}
          </div>
        )}
      </div>
      <div className={styles.graphActions}>
        {onDelete && (
          <div className={styles.moreWrapper} ref={menuRef}>
            <button
              className={styles.moreBtn}
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={t('graph.actions.more', 'Открыть меню')}
              title={t('graph.actions.title', 'Действия')}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className={styles.moreMenu}>
                <button
                  onClick={handleDeleteClick}
                  className={styles.deleteBtn}
                  disabled={deleting}
                  aria-label={deleting ? 'Удаление...' : deleteLabel}
                  title={deleting ? 'Удаление...' : deleteLabel}
                >
                  {deleteIcon && <img src={deleteIcon} alt="" className={styles.deleteIcon} />}
                  {deleteLabel}
                </button>
              </div>
            )}
          </div>
        )}
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose}>
            {closeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
