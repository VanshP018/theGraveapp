/** Shared animated backdrop for the glass screens (splash + auth). */
export function Aurora() {
  return (
    <>
      <div className="aurora" aria-hidden>
        <i className="blob b1" />
        <i className="blob b2" />
        <i className="blob b3" />
      </div>
      <div className="grain" aria-hidden />
    </>
  );
}
