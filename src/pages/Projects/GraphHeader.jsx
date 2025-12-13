import { useEffect, useRef, useState } from 'react';
import styles from './ProjectAnalysis.module.css';

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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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
          Nodes: {nodesCount} | Edges: {edgesCount} | Requirements: {requirementsCount} | Endpoints: {endpointsCount}
        </div>
      </div>
      <div className={styles.graphActions}>
        {onDelete && (
          <div className={styles.moreWrapper} ref={menuRef}>
            <button
              className={styles.moreBtn}
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Открыть меню"
              title="Действия"
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
