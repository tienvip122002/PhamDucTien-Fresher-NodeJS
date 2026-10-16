// Concurrency check against a running API.
// Creates a product with STOCK units, fires PARALLEL orders for 1 unit at the
// same time, then checks that exactly STOCK orders succeed, the rest get
// 409, and stock ends at 0 (never negative).
//
//   BASE_URL=http://localhost:3000 PARALLEL=20 STOCK=3 npm run test:oversell

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const PARALLEL = Number(process.env.PARALLEL ?? 20);
const STOCK = Number(process.env.STOCK ?? 3);

async function request(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const product = await request('POST', '/products', {
  sku: `OVERSELL-${Date.now()}`,
  name: 'Oversell check',
  price: 100,
  stock: STOCK,
});
if (product.status !== 201) {
  console.error('Could not create the test product:', product.body);
  process.exit(1);
}
const productId = product.body.id;
console.log(`Product ${productId} created with stock ${STOCK}`);
console.log(`Sending ${PARALLEL} orders at the same time...`);

const results = await Promise.all(
  Array.from({ length: PARALLEL }, (_, i) =>
    request('POST', '/orders', {
      customerName: `Buyer ${i + 1}`,
      customerEmail: `buyer${i + 1}@example.com`,
      items: [{ productId, quantity: 1 }],
    }),
  ),
);

const created = results.filter((r) => r.status === 201).length;
const rejected = results.filter(
  (r) => r.status === 409 && r.body?.code === 'INSUFFICIENT_STOCK',
).length;
const unexpected = results.length - created - rejected;
const stockAfter = (await request('GET', `/products/${productId}`)).body.stock;

console.table({
  'orders created (201)': created,
  'rejected INSUFFICIENT_STOCK (409)': rejected,
  'unexpected responses': unexpected,
  'stock after': stockAfter,
});

const passed =
  created === Math.min(STOCK, PARALLEL) &&
  unexpected === 0 &&
  stockAfter === Math.max(STOCK - PARALLEL, 0);
console.log(passed ? 'PASS: no overselling' : 'FAIL');
process.exit(passed ? 0 : 1);
