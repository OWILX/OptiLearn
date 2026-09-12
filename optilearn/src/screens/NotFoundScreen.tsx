import { Link } from 'react-router-dom';

export function NotFoundScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Page not found
        </h1>
        <Link
          to="/home"
          style={{ color: 'var(--color-brand-blue)', fontWeight: 600 }}
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
