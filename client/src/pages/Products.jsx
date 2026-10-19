import { useEffect, useState } from 'react';
import api from '../lib/api';

const categoriesList = ['All Categories', 'Electronics', 'Accessories', 'Audio', 'Storage'];
const statusesList = ['All Status', 'In Stock', 'Low Stock', 'Out of Stock'];

const productIcon = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('laptop')) return '💻';
  if (n.includes('mouse')) return '🖱';
  if (n.includes('keyboard') || n.includes('keypad')) return '⌨';
  if (n.includes('monitor')) return '🖥';
  if (n.includes('cable') || n.includes('hub')) return '🔌';
  if (n.includes('bag')) return '🎒';
  if (n.includes('headphone') || n.includes('speaker')) return '🎧';
  return '📦';
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All Categories');
  const [status, setStatus] = useState('All Status');
  const [sortBy, setSortBy] = useState('oldest');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('All Products');

  const [stockHistory, setStockHistory] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    category: 'Electronics',
    price: '',
    cost: '',
    stock: '',
    lowStockThreshold: 5,
    sku: '',
    description: '',
  });

  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustDelta, setAdjustDelta] = useState(10);
  const [adjustNote, setAdjustNote] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [modalErr, setModalErr] = useState('');
  const [feedback, setFeedback] = useState('');

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/products', {
        params: {
          search,
          category,
          status: tab === 'Low Stock' ? 'All Status' : status,
          lowStockOnly: tab === 'Low Stock' ? 'true' : undefined,
          sortBy,
          page,
          limit: 5,
        },
      });
      setProducts(data.products || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const fetchMeta = async () => {
    try {
      if (tab === 'Stock History') {
        const { data } = await api.get('/products/stock-history');
        setStockHistory(data);
      } else if (tab === 'Categories') {
        const { data } = await api.get('/products/categories');
        setCategoryStats(data);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchProducts();
    fetchMeta();
  }, [search, category, status, sortBy, page, tab]);

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (submitting) return;
    // Clear both feedback and error banners before submitting (IMP-12)
    setFeedback('');
    setErr('');
    setModalErr('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        sku: form.sku ? form.sku.trim().toUpperCase() : '',
        price: Number(form.price),
        cost: form.cost !== '' ? Number(form.cost) : Math.round(Number(form.price) * 0.75),
        stock: Number(form.stock),
        lowStockThreshold: form.lowStockThreshold !== '' ? Number(form.lowStockThreshold) : 5,
      };
      if (editing) {
        await api.put(`/products/${editing._id}`, payload);
        setFeedback(`Updated "${payload.name}" successfully.`);
      } else {
        await api.post('/products', payload);
        setFeedback(`Added "${payload.name}" to inventory.`);
      }
      setShowModal(false);
      setEditing(null);
      setForm({
        name: '',
        category: 'Electronics',
        price: '',
        cost: '',
        stock: '',
        lowStockThreshold: 5,
        sku: '',
        description: '',
      });
      fetchProducts();
      fetchMeta();
    } catch (e2) {
      const msg = e2.response?.data?.message || 'Failed to save product';
      setModalErr(msg);
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!adjustTarget || submitting) return;
    // Always clear previous feedback before attempting stock adjustment (fixes IMP-12)
    setFeedback('');
    setErr('');
    setModalErr('');

    const deltaNum = Number(adjustDelta);
    if (!Number.isInteger(deltaNum) || deltaNum === 0) {
      const msg = 'Quantity change must be a non-zero whole number.';
      setModalErr(msg);
      setErr(msg);
      return;
    }

    // Build an accurate audit note that matches the sign of delta (fixes IMP-13)
    const trimmedNote = adjustNote.trim();
    const resolvedNote = trimmedNote
      ? trimmedNote
      : deltaNum > 0
      ? `Stock restock (+${deltaNum})`
      : `Manual stock adjustment (${deltaNum})`;

    setSubmitting(true);
    try {
      await api.patch(`/products/${adjustTarget._id}/stock`, {
        delta: deltaNum,
        note: resolvedNote,
      });
      setFeedback(
        `Stock updated for "${adjustTarget.name}" (${deltaNum > 0 ? '+' : ''}${deltaNum} units · ${resolvedNote}).`
      );
      setAdjustTarget(null);
      setAdjustNote('');
      fetchProducts();
      fetchMeta();
    } catch (e2) {
      const msg = e2.response?.data?.message || 'Stock adjustment failed';
      setModalErr(msg);
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (p) => {
    // Always clear previous feedback before attempting deletion (fixes IMP-12)
    setFeedback('');
    setErr('');
    try {
      await api.delete(`/products/${p._id}`);
      setFeedback(`Deleted "${p.name}".`);
      fetchProducts();
      fetchMeta();
    } catch (e2) {
      setErr(e2.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="font-extrabold text-xl text-slate-900">Products &amp; Inventory</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage your products, SKUs, stock levels, and categories.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFeedback('');
            setErr('');
            setModalErr('');
            setForm({
              name: '',
              category: 'Electronics',
              price: '',
              cost: '',
              stock: '',
              lowStockThreshold: 5,
              sku: '',
              description: '',
            });
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition"
        >
          + Add Product
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-2.5 rounded-xl flex justify-between items-center"
        >
          <span>✓ {feedback}</span>
          <button onClick={() => setFeedback('')} className="text-emerald-600 font-bold" aria-label="Dismiss message">
            ✕
          </button>
        </div>
      )}
      {err && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2.5 rounded-xl flex justify-between items-center"
        >
          <span>⚠ {err}</span>
          <button onClick={() => setErr('')} className="text-red-600 font-bold" aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Underline Tabs */}
        <div className="flex gap-6 border-b border-slate-200 text-xs font-semibold overflow-x-auto">
          {['All Products', 'Low Stock', 'Stock History', 'Categories'].map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setPage(1);
                setErr('');
              }}
              className={`pb-3 whitespace-nowrap border-b-2 transition ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab 3: Stock History */}
        {tab === 'Stock History' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b">
                  <th className="text-left py-2.5">Product</th>
                  <th className="text-left py-2.5">Type</th>
                  <th className="text-center py-2.5">Change</th>
                  <th className="text-center py-2.5">Previous → New</th>
                  <th className="text-left py-2.5">Reason / Note</th>
                  <th className="text-right py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockHistory.map(log => (
                  <tr key={log._id} className="hover:bg-slate-50">
                    <td className="py-3 font-medium text-slate-800">{log.productName}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${
                          log.type === 'restock' || log.type === 'initial'
                            ? 'bg-emerald-50 text-emerald-700'
                            : log.type === 'sale'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {log.type}
                      </span>
                    </td>
                    <td className={`py-3 text-center font-bold ${log.change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {log.change > 0 ? `+${log.change}` : log.change}
                    </td>
                    <td className="py-3 text-center text-slate-600">
                      {log.previousStock} → {log.newStock}
                    </td>
                    <td className="py-3 text-slate-600">{log.note}</td>
                    <td className="py-3 text-right text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stockHistory.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400">No stock history entries recorded yet.</div>
            )}
          </div>
        )}

        {/* Tab 4: Categories */}
        {tab === 'Categories' && (
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            {categoryStats.map(c => (
              <div key={c.category} className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition">
                <div className="font-bold text-slate-900 text-sm">{c.category}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {c.count} products · {c.totalStock} units in stock
                </div>
                <div className="text-sm font-extrabold text-blue-600 mt-2">
                  Value: ৳ {Number(c.totalValue).toLocaleString()}
                </div>
                {c.lowStockCount > 0 && (
                  <div className="mt-2 inline-block text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                    {c.lowStockCount} low stock
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 1 & 2: Product List */}
        {(tab === 'All Products' || tab === 'Low Stock') && (
          <>
            {/* Search & Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[210px]">
                <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                <input
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by product name, SKU, or category..."
                  className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={category}
                onChange={e => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none"
                aria-label="Filter by category"
              >
                {categoriesList.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={e => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none"
                aria-label="Filter by status"
              >
                {statusesList.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={e => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none"
                aria-label="Sort products"
              >
                <option value="oldest">Default Order</option>
                <option value="name">Name (A–Z)</option>
                <option value="price_asc">Price (Low → High)</option>
                <option value="price_desc">Price (High → Low)</option>
                <option value="stock_asc">Stock (Low → High)</option>
                <option value="stock_desc">Stock (High → Low)</option>
              </select>
            </div>

            {loading ? (
              <div className="text-center py-10 text-xs text-slate-400">Loading inventory...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-left py-2.5 font-medium">#</th>
                      <th className="text-left py-2.5 font-medium">Product</th>
                      <th className="text-left py-2.5 font-medium">SKU</th>
                      <th className="text-left py-2.5 font-medium">Category</th>
                      <th className="text-left py-2.5 font-medium">Price</th>
                      <th className="text-center py-2.5 font-medium">Stock</th>
                      <th className="text-center py-2.5 font-medium">Status</th>
                      <th className="text-right py-2.5 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((p, i) => (
                      <tr key={p._id} className="hover:bg-slate-50/80">
                        <td className="py-3 text-slate-500">{(page - 1) * 5 + i + 1}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2.5 font-semibold text-slate-800">
                            <span className="w-8 h-8 bg-slate-100 rounded-lg grid place-items-center text-sm">
                              {productIcon(p.name)}
                            </span>
                            <div>
                              <div>{p.name}</div>
                              <div className="text-[10px] text-slate-400 font-normal">
                                Threshold: {p.lowStockThreshold ?? 5} units
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          {p.sku ? (
                            <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                              {p.sku}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 text-slate-600">{p.category}</td>
                        <td className="py-3 font-semibold text-slate-800">৳ {Number(p.price).toLocaleString()}</td>
                        <td className="py-3 text-center">
                          <span
                            className={`font-bold ${
                              p.stock === 0
                                ? 'text-red-600'
                                : p.status === 'Low Stock'
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {p.stock}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                              p.status === 'In Stock'
                                ? 'bg-emerald-50 text-emerald-700'
                                : p.status === 'Low Stock'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setFeedback('');
                              setErr('');
                              setModalErr('');
                              setAdjustTarget(p);
                              setAdjustDelta(10);
                              setAdjustNote('');
                            }}
                            title="Adjust stock"
                            className="px-2 py-1 rounded border border-slate-200 hover:bg-blue-50 text-blue-600 font-semibold"
                          >
                            ±Stock
                          </button>
                          <button
                            onClick={() => {
                              setFeedback('');
                              setErr('');
                              setModalErr('');
                              setEditing(p);
                              setForm({
                                name: p.name,
                                category: p.category,
                                price: p.price,
                                cost: p.cost ?? '',
                                stock: p.stock,
                                lowStockThreshold: p.lowStockThreshold ?? 5,
                                sku: p.sku || '',
                                description: p.description || '',
                              });
                              setShowModal(true);
                            }}
                            title="Edit product"
                            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            title="Delete product"
                            className="p-1.5 rounded border border-red-100 hover:bg-red-50 text-red-500"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {products.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-400">No matching products found.</div>
                )}

                {/* Pagination Footer */}
                <div className="flex flex-wrap justify-between items-center mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 gap-2">
                  <span>
                    Showing {products.length ? (page - 1) * 5 + 1 : 0} to {Math.min(page * 5, total)} of {total} products
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className="w-7 h-7 border rounded-lg disabled:opacity-40"
                    >
                      ‹
                    </button>
                    {Array.from({ length: Math.max(pages, 1) }, (_, idx) => idx + 1).map(n => (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={`w-7 h-7 rounded-lg font-semibold ${
                          page === n ? 'bg-blue-600 text-white' : 'border hover:bg-slate-50'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      disabled={page >= pages}
                      onClick={() => setPage(p => Math.min(pages, p + 1))}
                      className="w-7 h-7 border rounded-lg disabled:opacity-40"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={handleSaveProduct} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-3 text-xs">
            <h3 className="font-bold text-base text-slate-900">{editing ? 'Edit Product' : 'Add New Product'}</h3>
            {modalErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl">
                {modalErr}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-slate-600 mb-1 font-medium">Product Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Wireless Mouse"
                  className="w-full border rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">SKU Code</label>
                <input
                  value={form.sku}
                  onChange={e => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                  placeholder="e.g., MS-011"
                  className="w-full border rounded-xl px-3 py-2 font-mono outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2"
                >
                  <option>Electronics</option>
                  <option>Accessories</option>
                  <option>Audio</option>
                  <option>Storage</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Low-Stock Threshold</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.lowStockThreshold}
                  onChange={e => setForm({ ...form, lowStockThreshold: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Selling Price (৳) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Unit Cost (৳)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={e => setForm({ ...form, cost: e.target.value })}
                  placeholder="Optional"
                  className="w-full border rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Stock Qty *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={form.stock}
                  onChange={e => setForm({ ...form, stock: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-medium">Description</label>
              <input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Optional product specifications"
                className="w-full border rounded-xl px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditing(null);
                  setModalErr('');
                }}
                className="px-4 py-2 border rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editing ? 'Update Product' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={handleAdjustStock} className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3 text-xs">
            <h3 className="font-bold text-base text-slate-900">Adjust Stock — {adjustTarget.name}</h3>
            <p className="text-slate-500">
              Current stock: <strong>{adjustTarget.stock}</strong> units
              {adjustTarget.sku ? ` · SKU: ${adjustTarget.sku}` : ''}
            </p>
            {modalErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl">
                {modalErr}
              </div>
            )}
            <div>
              <label className="block text-slate-600 mb-1 font-medium">
                Quantity Change (+ to restock, - to deduct)
              </label>
              <input
                type="number"
                step="1"
                required
                value={adjustDelta}
                onChange={e => {
                  setAdjustDelta(e.target.value === '' ? '' : Number(e.target.value));
                  setModalErr('');
                }}
                className="w-full border rounded-xl px-3 py-2"
              />
              {Number.isInteger(Number(adjustDelta)) && Number(adjustDelta) !== 0 && (
                <div
                  className={`mt-1 text-[11px] font-medium ${
                    adjustTarget.stock + Number(adjustDelta) < 0 ? 'text-red-600' : 'text-slate-500'
                  }`}
                >
                  Resulting stock: {adjustTarget.stock} → {adjustTarget.stock + Number(adjustDelta)} units
                </div>
              )}
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-medium">Reason / Audit Note</label>
              <input
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder={
                  Number(adjustDelta) >= 0
                    ? 'e.g., Supplier restock shipment'
                    : 'e.g., Damaged item / inventory count deduction'
                }
                className="w-full border rounded-xl px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAdjustTarget(null);
                  setModalErr('');
                }}
                className="px-4 py-2 border rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50"
              >
                {submitting ? 'Applying...' : 'Apply Adjustment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
