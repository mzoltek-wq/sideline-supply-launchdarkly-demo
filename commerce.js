// Pure pricing functions: dollars enter the catalog; all arithmetic uses cents.
// One of each product type, from one sport, makes a flexible game-day bundle.
const commerce = (() => {
  const catalog = [
    { type: 'jersey', name: 'Club Jersey', price: 64, detail: 'Relaxed fit · Demo size M' },
    { type: 'cap', name: 'Everyday Cap', price: 28, detail: 'Adjustable · One size' },
    { type: 'hoodie', name: 'Sideline Hoodie', price: 78, detail: 'Heavyweight fleece · Demo size M' }
  ];
  function priceBundle(types) {
    const products = catalog.filter(product => types.includes(product.type));
    if (!products.length || products.length !== types.length) throw new Error('Choose distinct catalog products.');
    const percent = products.length === 3 ? 10 : products.length === 2 ? 5 : 0;
    const regularCents = products.reduce((sum, product) => sum + Math.round(product.price * 100), 0);
    const savingsCents = Math.round(regularCents * percent / 100);
    return { regularCents, savingsCents, totalCents: regularCents - savingsCents, percent };
  }
  function linePrice(item) {
    if (item.isBundle) return priceBundle(item.types);
    const product = catalog.find(product => product.type === item.type);
    if (!product) throw new Error('Unknown product.');
    const cents = Math.round(product.price * 100);
    return { regularCents: cents, savingsCents: 0, totalCents: cents, percent: 0 };
  }
  function totals(bag) {
    return bag.reduce((sum, item) => {
      const price = linePrice(item);
      sum.totalCents += price.totalCents * item.quantity;
      sum.savingsCents += price.savingsCents * item.quantity;
      sum.pieces += (item.isBundle ? item.types.length : 1) * item.quantity;
      return sum;
    }, { totalCents: 0, savingsCents: 0, pieces: 0 });
  }
  return { catalog, priceBundle, linePrice, totals };
})();
if (typeof module !== 'undefined') module.exports = commerce;
