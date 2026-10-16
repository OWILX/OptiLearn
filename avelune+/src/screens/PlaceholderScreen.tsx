interface PlaceholderScreenProps {
  name: string;
}

export function PlaceholderScreen({ name }: PlaceholderScreenProps) {
  return (
    <section>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{name}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        This area is scaffolded and will be built in a later phase.
      </p>
    </section>
  );
}
