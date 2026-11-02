import Link from 'next/link';
import Image from 'next/image';

export default function ProductBrand() {
  return <Link className="site-brand" href="/" aria-label="Loyalty4All home">
    <Image src="/community/assets/loyalty-4-all-logo.png" width={54} height={54} unoptimized alt="" />
    <span><strong>Loyalty4All</strong><small>Community Edition</small></span>
  </Link>;
}
