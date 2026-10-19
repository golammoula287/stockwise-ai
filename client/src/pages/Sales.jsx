import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';

export default function Sales() {
  const location = useLocation();
  const [tab, setTab] = useState(location.pathname === '/customers' ? 'Customers' : 'New Sale');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [businessConfig, setBusinessConfig] = useState({ currency: '৳', taxRate: 0 });

  // POS Cart & Customer State
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [submittingSale, setSubmittingSale] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Customer Management State
  const [custSearch, setCustSearch] = useState('');
  const [showCustModal, setShowCustModal] = useState(false);
  const [custModalOrigin, setCustModalOrigin] = useState('customers');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [custForm, setCustForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [historyModal, setHistoryModal] = useState(null);

  useEffect(() => {
    if (location.pathname === '/customers') setTab('Customers');
    else if (location.pathname === '/sales' && tab === 'Customers') setTab('New Sale');
  }, [location.pathname]);

  const loadAll = async () => {
    try {
      const [pRes, cRes, sRes, setRes] = await Promise.all([
        api.get('/products?limit=100'),
        api.get('/customers'),
        api.get('/sales?limit=50'),
        api.get('/settings').catch(() => ({ data: {} })),
      ]);
      setProducts(pRes.data.products || []);
      setCustomers(Array.isArray(cRes.data) ? cRes.data : []);
      setSales(sRes.data.sales || []);
      if (setRes.data?.business) {
        setBusinessConfig({
          currency: setRes.data.business.currency || '৳',
          taxRate: Number(setRes.data.business.taxRate) || 0,
        });
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadAll();
  }, []);

  const resetCustomerSelection = () => {
    setSelectedCustomer('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
  };

  const handleSelectCustomer = (id) => {
    setSelectedCustomer(id);
    const found = customers.find(c => c._id === id);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone);
      setCustomerEmail(found.email || '');
    } else {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
    }
  };

  const addToCart = (p) => {
    setMsg({ text: '', type: '' });
    if (p.stock <= 0) {
      setMsg({ text: `${p.name} is out of stock.`, type: 'error' });
      return;
    }
    setCart(prev => {
      const existing = prev.find(x => x.product === p._id);
      if (existing) {
        if (existing.quantity + 1 > p.stock) {
          setMsg({ text: `Only ${p.stock} units of ${p.name} available in stock.`, type: 'error' });
          return prev;
        }
        return prev.map(x => (x.product === p._id ? { ...x, quantity: x.quantity + 1 } : x));
      }
      return [...prev, { product: p._id, name: p.name, price: p.price, stock: p.stock, quantity: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setMsg({ text: '', type: '' });
    setCart(prev =>
      prev
        .map(item => {
          if (item.product !== productId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty > item.stock) return item;
          return { ...item, quantity: nextQty };
        })
        .filter(item => item.quantity > 0)
    );
  };

  const subtotal = cart.reduce((s, x) => s + x.price * x.quantity, 0);
  const cleanDiscount = Math.max(Number(discount) || 0, 0);
  const netAfterDiscount = Math.max(subtotal - cleanDiscount, 0);
  const taxAmount = Math.round(netAfterDiscount * ((businessConfig.taxRate || 0) / 100) * 100) / 100;
  const total = Math.round((netAfterDiscount + taxAmount) * 100) / 100;

  const completeSale = async () => {
    if (submittingSale) return;
    if (cart.length === 0) {
      setMsg({ text: 'Please add at least one product to the cart.', type: 'error' });
      return;
    }
    if (cleanDiscount > subtotal) {
      setMsg({ text: 'Discount cannot exceed the cart subtotal.', type: 'error' });
      return;
    }
    setMsg({ text: '', type: '' });
    setSubmittingSale(true);
    try {
      const payload = {
        customer: selectedCustomer || undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        items: cart.map(c => ({ product: c.product, quantity: c.quantity })),
        discount: cleanDiscount,
        taxRate: businessConfig.taxRate || 0,
        paymentMethod,
      };
      const { data } = await api.post('/sales', payload);
      setMsg({
        text: `Sale ${data.invoiceNumber} completed for ${data.customerName || 'Walk-in Customer'}! Total: ${businessConfig.currency} ${Number(data.total).toLocaleString()}`,
        type: 'success',
      });
      // Reset cart, discount, AND customer selection so subsequent sales start as Walk-in Customer (fixes IMP-04)
      setCart([]);
      setDiscount(0);
      resetCustomerSelection();
      loadAll();
    } catch (e) {
      setMsg({ text: e.response?.data?.message || 'Checkout failed', type: 'error' });
    } finally {
      setSubmittingSale(false);
    }
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    setMsg({ text: '', type: '' });
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer._id}`, custForm);
      } else {
        const { data } = await api.post('/customers', custForm);
        // Only bind customer to POS cart if modal was opened from the New Sale POS panel (fixes IMP-04)
        if (custModalOrigin === 'pos') {
          setSelectedCustomer(data._id);
          setCustomerName(data.name);
          setCustomerPhone(data.phone);
          setCustomerEmail(data.email || '');
        }
      }
      setShowCustModal(false);
      setEditingCustomer(null);
      setCustForm({ name: '', phone: '', email: '', address: '' });
      loadAll();
    } catch (e2) {
      setMsg({ text: e2.response?.data?.message || 'Failed to save customer', type: 'error' });
    }
  };

  const viewPurchaseHistory = async (custId) => {
    try {
      const { data } = await api.get(`/customers/${custId}`);
      setHistoryModal(data);
    } catch (_) {}
  };

  const filteredProducts = products.filter(
    p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredCustomers = customers.filter(
    c =>
      c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
      (c.phone || '').includes(custSearch) ||
      (c.email || '').toLowerCase().includes(custSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Top Tabs */}
      <div className="bg-white border border-slate-200/80 rounded-2xl px-5 pt-3 shadow-sm">
        <div className="flex gap-6 text-xs font-semibold">
          {['New Sale', 'Sales History', 'Customers'].map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setMsg({ text: '', type: '' });
              }}
              className={`pb-3 border-b-2 transition ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: NEW SALE (3-Column POS) */}
      {tab === 'New Sale' && (
        <div className="grid lg:grid-cols-12 gap-5">
          {/* Col 1: Add Products */}
          <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
            <h2 className="font-bold text-sm text-slate-900">Add Products</h2>
            <div className="relative mt-3">
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products or SKU..."
                className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>

            <div className="mt-3 space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
              {filteredProducts.map(p => (
                <div
                  key={p._id}
                  className="flex items-center gap-3 border border-slate-100 hover:border-slate-200 rounded-xl p-2.5"
                >
                  <div className="w-10 h-10 bg-slate-100 rounded-lg grid place-items-center text-base shrink-0">
                    {p.name.toLowerCase().includes('laptop')
                      ? '💻'
                      : p.name.toLowerCase().includes('mouse')
                      ? '🖱'
                      : p.name.toLowerCase().includes('keyboard')
                      ? '⌨'
                      : '🖥'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{p.name}</div>
                    <div className="text-xs font-semibold text-slate-700">
                      {businessConfig.currency} {Number(p.price).toLocaleString()}
                    </div>
                    <div className={`text-[11px] ${p.stock === 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                      Stock: {p.stock} {p.sku ? `· ${p.sku}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => addToCart(p)}
                    disabled={p.stock === 0}
                    className={`w-8 h-8 rounded-lg font-bold text-white grid place-items-center transition ${
                      p.stock === 0 ? 'bg-red-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                    aria-label={`Add ${p.name} to cart`}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Col 2: Cart & Totals */}
          <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="font-bold text-sm text-slate-900">Cart ({cart.length} items)</h2>
                <button
                  onClick={() => {
                    setCart([]);
                    setDiscount(0);
                    setMsg({ text: '', type: '' });
                  }}
                  className="text-xs font-semibold text-red-500 hover:underline"
                >
                  Clear Cart
                </button>
              </div>

              <div className="space-y-2.5 mt-3 max-h-[260px] overflow-y-auto">
                {cart.map(c => (
                  <div
                    key={c.product}
                    className="flex items-center justify-between gap-2 border border-slate-100 rounded-xl p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 truncate">{c.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {businessConfig.currency} {Number(c.price).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQty(c.product, -1)}
                        className="w-6 h-6 border rounded-md text-xs hover:bg-slate-50"
                      >
                        -
                      </button>
                      <span className="text-xs font-semibold w-6 text-center">{c.quantity}</span>
                      <button
                        onClick={() => updateQty(c.product, 1)}
                        className="w-6 h-6 border rounded-md text-xs hover:bg-slate-50"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-xs font-bold text-slate-900 w-20 text-right">
                      {businessConfig.currency} {(c.price * c.quantity).toLocaleString()}
                    </div>
                  </div>
                ))}
                {cart.length === 0 && (
                  <div className="text-center py-10 text-xs text-slate-400">
                    Your cart is empty. Click + on a product to add it.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-4 mt-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-800">
                  {businessConfig.currency} {subtotal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Discount</span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  className="w-24 text-right border rounded-lg px-2 py-1 text-xs outline-none"
                />
              </div>
              {businessConfig.taxRate > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax ({businessConfig.taxRate}%)</span>
                  <span className="font-medium text-slate-700">
                    {businessConfig.currency} {taxAmount.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-slate-600">
                <span>Payment Method</span>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-xs bg-white outline-none"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bkash">bKash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex justify-between items-center text-sm font-extrabold text-slate-900 pt-2 border-t">
                <span>Total</span>
                <span>
                  {businessConfig.currency} {total.toLocaleString()}
                </span>
              </div>

              <button
                onClick={completeSale}
                disabled={submittingSale}
                className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                {submittingSale ? 'Processing Sale...' : 'Complete Sale'}
              </button>

              {msg.text && (
                <div
                  role="alert"
                  className={`p-2.5 rounded-xl text-xs mt-2 ${
                    msg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {msg.text}
                </div>
              )}
            </div>
          </div>

          {/* Col 3: Customer Information */}
          <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-slate-900">Customer Information</h2>
              {(selectedCustomer || customerName || customerPhone) && (
                <button
                  type="button"
                  onClick={resetCustomerSelection}
                  className="text-[11px] text-slate-500 hover:text-red-600 underline"
                >
                  Reset to Walk-in
                </button>
              )}
            </div>

            <div>
              <select
                value={selectedCustomer}
                onChange={e => handleSelectCustomer(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white outline-none"
                aria-label="Select Customer"
              >
                <option value="">Walk-in Customer (Default)</option>
                {customers.map(c => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            <input
              value={customerName}
              onChange={e => {
                setSelectedCustomer('');
                setCustomerName(e.target.value);
              }}
              placeholder="Customer Name (or leave blank for Walk-in)"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 outline-none"
            />
            <input
              value={customerPhone}
              onChange={e => {
                setSelectedCustomer('');
                setCustomerPhone(e.target.value);
              }}
              placeholder="Phone Number"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 outline-none"
            />
            <input
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
              placeholder="Email (Optional)"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 outline-none"
            />

            <button
              type="button"
              onClick={() => {
                setEditingCustomer(null);
                setCustModalOrigin('pos');
                setCustForm({ name: '', phone: '', email: '', address: '' });
                setShowCustModal(true);
              }}
              className="text-blue-600 font-semibold hover:underline inline-flex items-center gap-1 pt-1"
            >
              + Add New Customer
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: SALES HISTORY */}
      {tab === 'Sales History' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-base text-slate-900 mb-3">Sales Transactions History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b">
                  <th className="text-left py-2.5">Invoice</th>
                  <th className="text-left py-2.5">Customer</th>
                  <th className="text-left py-2.5">Items</th>
                  <th className="text-center py-2.5">Method</th>
                  <th className="text-right py-2.5">Total</th>
                  <th className="text-right py-2.5">Profit</th>
                  <th className="text-right py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map(s => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-blue-600">{s.invoiceNumber || 'INV'}</td>
                    <td className="py-3 font-medium text-slate-800">
                      {s.customer?.name || s.customerName || 'Walk-in Customer'}
                    </td>
                    <td className="py-3 text-slate-600">
                      {(s.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ')}
                    </td>
                    <td className="py-3 text-center capitalize text-slate-500">{s.paymentMethod || 'cash'}</td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {businessConfig.currency} {Number(s.total).toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-semibold text-emerald-600">
                      {businessConfig.currency} {Number(s.profit || 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sales.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400">No sales transactions recorded yet.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CUSTOMERS CRUD & PURCHASE HISTORY */}
      {tab === 'Customers' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <input
              value={custSearch}
              onChange={e => setCustSearch(e.target.value)}
              placeholder="Search customers by name, phone, or email..."
              className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs w-72 outline-none"
            />
            <button
              onClick={() => {
                setEditingCustomer(null);
                setCustModalOrigin('customers');
                setCustForm({ name: '', phone: '', email: '', address: '' });
                setShowCustModal(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-semibold"
            >
              + Add New Customer
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b">
                  <th className="text-left py-2.5">Name</th>
                  <th className="text-left py-2.5">Phone</th>
                  <th className="text-left py-2.5">Email</th>
                  <th className="text-center py-2.5">Orders</th>
                  <th className="text-right py-2.5">Total Spent</th>
                  <th className="text-right py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map(c => (
                  <tr key={c._id} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-slate-800">{c.name}</td>
                    <td className="py-3 text-slate-600">{c.phone}</td>
                    <td className="py-3 text-slate-500">{c.email || '—'}</td>
                    <td className="py-3 text-center font-semibold">{c.totalOrders || 0}</td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {businessConfig.currency} {Number(c.totalSpent || 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right space-x-2">
                      <button
                        onClick={() => viewPurchaseHistory(c._id)}
                        className="text-blue-600 font-semibold hover:underline"
                      >
                        History ({c.totalOrders || 0})
                      </button>
                      <button
                        onClick={() => {
                          setEditingCustomer(c);
                          setCustModalOrigin('customers');
                          setCustForm({
                            name: c.name,
                            phone: c.phone,
                            email: c.email || '',
                            address: c.address || '',
                          });
                          setShowCustModal(true);
                        }}
                        className="text-slate-600 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCustomers.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400">No matching customers found.</div>
            )}
          </div>
        </div>
      )}

      {/* Customer Create/Edit Modal */}
      {showCustModal && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={handleSaveCustomer} className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3 text-xs">
            <h3 className="font-bold text-base text-slate-900">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h3>
            <input
              required
              placeholder="Customer Name"
              value={custForm.name}
              onChange={e => setCustForm({ ...custForm, name: e.target.value })}
              className="w-full border rounded-xl px-3 py-2"
            />
            <input
              required
              placeholder="Phone Number"
              value={custForm.phone}
              onChange={e => setCustForm({ ...custForm, phone: e.target.value })}
              className="w-full border rounded-xl px-3 py-2"
            />
            <input
              type="email"
              placeholder="Email (Optional)"
              value={custForm.email}
              onChange={e => setCustForm({ ...custForm, email: e.target.value })}
              className="w-full border rounded-xl px-3 py-2"
            />
            <input
              placeholder="Address (Optional)"
              value={custForm.address}
              onChange={e => setCustForm({ ...custForm, address: e.target.value })}
              className="w-full border rounded-xl px-3 py-2"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCustModal(false)} className="px-4 py-2 border rounded-xl">
                Cancel
              </button>
              <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">
                Save Customer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Purchase History Modal */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-3 text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {historyModal.customer.name} — Purchase History ({historyModal.purchaseHistory?.length || 0} orders)
                </h3>
                <p className="text-slate-500">
                  {historyModal.customer.phone} · Total Spent: {businessConfig.currency}{' '}
                  {Number(historyModal.customer.totalSpent || 0).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setHistoryModal(null)}
                className="text-slate-400 hover:text-slate-700 text-base"
                aria-label="Close purchase history"
              >
                ✕
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {(historyModal.purchaseHistory || []).map(s => (
                <div key={s._id} className="py-2.5 flex justify-between items-center gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{s.invoiceNumber || 'Sale'}</div>
                    <div className="text-slate-500">
                      {(s.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900">
                      {businessConfig.currency} {Number(s.total).toLocaleString()}
                    </div>
                    <div className="text-slate-400">{new Date(s.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {(!historyModal.purchaseHistory || historyModal.purchaseHistory.length === 0) && (
                <div className="py-6 text-center text-slate-400">No purchases found for this customer.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
