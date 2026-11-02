import Link from 'next/link';
import ProductBrand from './product-brand';

export default function NotFound() {
  return <main className="product-site">
    <header className="site-header"><ProductBrand /></header>
    <h1>Page not found</h1><p>This page is not available. <Link href="/">Return home</Link>.</p>
  </main>;
}
