import styles from './RouteLoading.module.css';

export function RouteLoading() {
  return (
    <div className={styles.wrap}>
      <div className={styles.spinner} aria-label="Loading" role="status" />
    </div>
  );
}
