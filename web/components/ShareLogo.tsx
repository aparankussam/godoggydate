// The logo on pixels people export and share (cards captured by html2canvas).
// A plain <img> of the trimmed PNG: html2canvas ignores object-fit, so
// BrandLogo's framing would come out stretched in the saved image.
export const SHARE_LOGO = '/brand/godoggydate-logo-share.png';
const RATIO = 900 / 234;

export default function ShareLogo({ height }: { height: number }) {
  const width = Math.round(height * RATIO);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={SHARE_LOGO} alt="GoDoggyDate" width={width} height={height} style={{ width, height, display: 'block' }} />;
}
