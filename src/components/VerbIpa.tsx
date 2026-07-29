export default function VerbIpa({
  ipaV1,
  ipaV2,
  ipaV3,
  className = "",
}: {
  ipaV1?: string | null;
  ipaV2?: string | null;
  ipaV3?: string | null;
  className?: string;
}) {
  if (!ipaV1 && !ipaV2 && !ipaV3) return null;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-serif text-golddark ${className}`}>
      <span><b className="font-sans text-[0.7em]">V1</b> {ipaV1 || "—"}</span>
      <span><b className="font-sans text-[0.7em]">V2</b> {ipaV2 || "—"}</span>
      <span><b className="font-sans text-[0.7em]">V3</b> {ipaV3 || "—"}</span>
    </div>
  );
}
