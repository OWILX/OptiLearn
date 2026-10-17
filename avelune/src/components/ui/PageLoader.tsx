import styles from './PageLoader.module.css';
export function PageLoader({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.spinner}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
      </div>
      <span className={styles.text}>{text}</span>
    </div>
  );
}
