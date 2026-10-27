/** Decorative only: independent of session, camera and playback state. */
export default function PlayfulSky() {
  return (
    <div className="playful-sky" aria-hidden="true">
      <span className="sky-cloud sky-cloud--one" />
      <span className="sky-cloud sky-cloud--two" />
      <svg className="sky-balloon" viewBox="0 0 120 160" fill="none">
        <path d="M22 90 44 133M98 90 76 133" stroke="#B18B5D" strokeWidth="3" />
        <path d="M60 7C-5 7 1 76 39 106H81C119 76 125 7 60 7Z" fill="#8ACFC7" />
        <path d="M60 7C26 7 25 75 49 106H71C95 75 94 7 60 7Z" fill="#FFE09A" />
        <path d="M60 7C46 30 46 82 57 106H63C74 82 74 30 60 7Z" fill="#FFF0C5" />
        <path d="M42 128H78L74 148Q60 157 46 148Z" fill="#D7AA76" />
      </svg>
      <svg className="sky-plane" viewBox="0 0 100 90" fill="none">
        <path d="M8 12 94 32 41 73 34 43Z" fill="#F5D272" />
        <path d="m8 12 50 31 44 1-60 11Z" fill="#E9B958" />
        <path d="m34 43 7 30 9-29Z" fill="#FFF1B9" />
      </svg>
      <span className="sky-star sky-star--one">✦</span>
      <span className="sky-star sky-star--two">✧</span>
      <span className="sky-star sky-star--three">✦</span>
    </div>
  );
}
