export default function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <p style={{ color: '#666' }}>Built in {phase} — see BUILD_PLAN.md.</p>
    </div>
  )
}
