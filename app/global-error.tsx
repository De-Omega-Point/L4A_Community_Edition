'use client';
import ProductBrand from './product-brand';

export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="en"><body>
    <ProductBrand />
    <main><h1>This page could not load</h1><p>Please try again.</p>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  </body></html>;
}
