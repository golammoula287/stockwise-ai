import { useConfirm } from '../context/ConfirmContext';
import { salesPeriod, fetchSalesReport } from '../../../shared/salesPeriod.mjs';
import { currentBusinessMonth } from '../../../shared/dashboardAnalytics.mjs';
import SearchBox from '../components/SearchBox';
import CashMemo from '../components/CashMemo';
import useOverlay from '../lib/useOverlay';
import { isDemoSandbox } from '../lib/demoSandbox';
import { downloadSalesReport, printCashMemo } from '../lib/salesDocuments';
import QRScanner from '../components/QRScanner';
import { useDemoMode } from '../context/DemoModeContext';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import {
  formatCount,
  formatUnits,
  formatItems,
  formatCurrency,
  formatDateTimeBD,
} from '../lib/formatters';

const TAB_TO_QUERY = {
  'New Sale': 'new',
  'Sales History': 'history',
  Customers: 'customers',
};

function resolveTabFromQuery(tabParam, pathname) {
  const normalized = String(tabParam || '').trim().toLowerCase();
  if (normalized === 'history' || normalized === 'sales-history') return 'Sales History';
  if (normalized === 'customers' || normalized === 'customer' || pathname === '/customers') {
    return 'Customers';
  }
  return 'New Sale';
}

export default function Sales() {
  const demoReadOnly = useDemoMode();
  const confirm = useConfirm();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTabFromQuery(searchParams.get('tab'), location.pathname);

  const setTab = (nextTabLabel) => {
    const queryValue = TAB_TO_QUERY[nextTabLabel] || 'new';
    setSearchParams({ tab: queryValue });
  };
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [periodMode, setPeriodMode] = useState('all');
  const [reportMonth, setReportMonth] = useState(currentBusinessMonth);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const periodParams = periodMode === 'month' ? { month: reportMonth } : periodMode === 'range' ? { startDate, endDate } : {};
  let periodError = '';
  try { if (periodMode === 'range' && (!startDate || !endDate)) throw new Error('Choose both start and end dates.'); if (periodMode === 'month' && !reportMonth) throw new Error('Choose a month.'); salesPeriod(periodParams); } catch (error) { periodError = error.message; }
  const periodKey = JSON.stringify(periodParams);
  const [historySearch, setHistorySearch] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyTotal, setHistoryTotal] = useState(0);
  const salesRequest = useRef(0);
  const lastHistorySearch = useRef('');
  const [businessConfig, setBusinessConfig] = useState({ currency: '৳', taxRate: 0 });

  // POS Cart & Customer State
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const posRef = useRef(null);
  const [search, setSearch] = useState('');
  const [posCategory, setPosCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState('');
  const [allowDues, setAllowDues] = useState(false);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectError, setCollectError] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [submittingSale, setSubmittingSale] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Customer & Invoice Modal State
  const [custSearch, setCustSearch] = useState('');
  const [checkoutCustomerSearch, setCheckoutCustomerSearch] = useState('');
  const [showCustModal, setShowCustModal] = useState(false);
  const [custModalOrigin, setCustModalOrigin] = useState('customers');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [custForm, setCustForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [historyModal, setHistoryModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const overlayRef = useOverlay(Boolean(invoiceModal || historyModal || showCustModal || checkoutOpen), () => {
    if (invoiceModal || historyModal || showCustModal) { setInvoiceModal(null); setHistoryModal(null); setShowCustModal(false); }
    else setCheckoutOpen(false);
  });
  useEffect(() => {
    if (tab !== 'New Sale') { setCheckoutOpen(false); return; }
    const fit = () => {
      const node = posRef.current;
      if (node) { const top = node.getBoundingClientRect().top + window.scrollY; node.style.setProperty('--pos-height', `${Math.max(280, window.innerHeight - top - 20)}px`); }
      if (window.innerWidth >= 1000) setCheckoutOpen(false);
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [tab]);

  const fetchSalesHistory = async (term = historySearch) => {
    const request = ++salesRequest.current;
    if (periodError) { setSales([]); setHistoryTotal(0); setHistoryBusy(false); return; }
    setHistoryBusy(true); setHistoryError('');
    try {
      const response = await api.get('/sales', { params: { ...periodParams, search: term.trim(), limit: 50 } });
      if (request === salesRequest.current) { setSales(response.data.sales || []); setHistoryTotal(response.data.total || 0); }
      return response;
    } catch (error) {
      if (request === salesRequest.current) setHistoryError(error.response?.data?.message || 'Could not search sales history.');
    } finally { if (request === salesRequest.current) setHistoryBusy(false); }
  };
  useEffect(() => {
    const term = historySearch.trim();
    const key = term + periodKey;
    if (key === lastHistorySearch.current) return;
    lastHistorySearch.current = key;
    salesRequest.current++; setHistoryBusy(true); setExportMessage('');
    const timer = setTimeout(() => fetchSalesHistory(term), 250);
    return () => clearTimeout(timer);
  }, [historySearch.trim(), periodKey, periodError]);

  const exportReport = async () => {
    setExportBusy(true); setExportMessage('');
    try {
      const params = { ...periodParams, search: historySearch.trim() };
      const rows = await fetchSalesReport(api.get.bind(api), params);
      if (!rows.length) { setExportMessage('No sales found for this selection.'); return; }
      downloadSalesReport(rows, businessConfig.currency, salesPeriod(params).label);
      setExportMessage(`Downloaded ${rows.length} transactions.`);
    } catch (error) { setExportMessage(error.response?.data?.message || 'Could not download the report. Please try again.'); }
    finally { setExportBusy(false); }
  };

  const loadAll = async () => {
    try {
      const [pRes, cRes, sRes, setRes] = await Promise.all([
        api.get('/products?limit=100'),
        api.get('/customers'),
        fetchSalesHistory(),
        api.get('/settings').catch(() => ({ data: {} })),
      ]);
      setProducts(pRes.data.products || []);
      setCustomers(Array.isArray(cRes.data) ? cRes.data : []);
      if (setRes.data?.business) {
        setAllowDues(setRes.data.preferences?.allowDues === true);
        setBusinessConfig({
          ...setRes.data.business,
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
    setCheckoutCustomerSearch('');
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
          setMsg({
            text: `Only ${formatUnits(p.stock)} of ${p.name} available in stock.`,
            type: 'error',
          });
          return prev;
        }
        return prev.map(x => (x.product === p._id ? { ...x, quantity: x.quantity + 1 } : x));
      }
      return [...prev, { product: p._id, name: p.name, price: p.price, stock: p.stock, quantity: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    if (delta < 0 && cart.length === 1 && cart[0].product === productId && cart[0].quantity === 1) { setDiscount(0); setAmountPaid(''); }
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

  const subtotal = Math.round(cart.reduce((s, x) => s + x.price * x.quantity, 0) * 100) / 100;
  const cleanDiscount = Math.round(Math.max(Number(discount) || 0, 0) * 100) / 100;
  const taxableAmount = Math.round(Math.max(subtotal - cleanDiscount, 0) * 100) / 100;
  const taxAmount = Math.round(taxableAmount * (Number(businessConfig.taxRate || 0) / 100) * 100) / 100;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

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
    if(!await confirm({title:'Complete this sale?',message:`Record a sale of ${formatCurrency(total,businessConfig.currency)} for ${customerName.trim() || 'Walk-in Customer'}? Product stock will decrease and an invoice will be created.${allowDues && amountPaid!=='' && Number(amountPaid)<total ? ` Outstanding balance: ${formatCurrency(total-Number(amountPaid),businessConfig.currency)}.` : ''}`,confirmLabel:'Complete sale'}))return;
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
        ...(allowDues && amountPaid !== '' ? { amountPaid: Number(amountPaid) } : {}),
      };
      const { data } = await api.post('/sales', payload);
      setMsg({
        text: `Sale ${data.invoiceNumber} completed for ${data.customerName || 'Walk-in Customer'}! Total: ${formatCurrency(data.total, businessConfig.currency)}`,
        type: 'success',
      });
      // Reset cart, discount, AND customer selection so subsequent sales start as Walk-in Customer (fixes IMP-04)
      setCheckoutOpen(false);
      setInvoiceModal(data);
      setAmountPaid('');
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

  const renderPersistedTaxBadge = (sale) => {
    if (sale.taxAmount === null || sale.taxAmount === undefined) {
      return <span className="text-slate-400 text-[11px]" title="Pre-migration legacy invoice (tax rate not recorded)">Legacy (—)</span>;
    }
    const amt = formatCurrency(sale.taxAmount, businessConfig.currency);
    const rate = sale.taxRate !== null && sale.taxRate !== undefined ? ` (${sale.taxRate}%)` : '';
    return (
      <span className="text-slate-700 font-medium">
        {amt}
        <span className="text-slate-400 text-[11px]">{rate}</span>
      </span>
    );
  };

  const filteredProducts = products.filter(
    p =>
      (posCategory === 'All' || p.category === posCategory) && (p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(search.trim().toLowerCase()))
  );

  const checkoutCustomerMatches = customers.filter(customer => [customer.name, customer.phone, customer.email].some(value => String(value || '').toLowerCase().includes(checkoutCustomerSearch.trim().toLowerCase())));
  const checkoutCustomerOptions = customers.filter(customer => checkoutCustomerMatches.includes(customer) || customer._id === selectedCustomer);

  const filteredCustomers = customers.filter(
    c =>
      c.name.toLowerCase().includes(custSearch.trim().toLowerCase()) ||
      (c.phone || '').includes(custSearch.trim()) ||
      (c.email || '').toLowerCase().includes(custSearch.trim().toLowerCase())
  );

  return (
    <div className="sales-page space-y-5">
      {/* Unified Page Header (Task 2) */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="font-extrabold text-xl text-slate-900">Sales &amp; Customers</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create sales, review invoices, and keep customer records together.
          </p>
        </div>
      </div>

      {/* Top Tabs */}
      <div className="sales-tabs">
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

      {tab === 'New Sale' && <div ref={posRef} className={`pos-workspace ${checkoutOpen ? 'checkout-is-open' : ''}`}>
        <section className="pos-catalog" aria-labelledby="pos-products-title">
          <div className="pos-section-heading"><div><span className="pos-step">01 / PRODUCTS</span><h2 id="pos-products-title">Choose your products</h2><p>Search or scan a code, then add items to the order.</p></div><button type="button" className="pos-order-jump" onClick={()=>setCheckoutOpen(true)}>Review order ({cart.reduce((sum,item)=>sum+item.quantity,0)}) · {formatCurrency(total,businessConfig.currency)}</button></div>
          <div className="pos-product-filters"><SearchBox value={search} onChange={setSearch} label="Search products or SKU" placeholder="Product name or SKU"/><label><span className="sr-only">Product category</span><select aria-label="Product category" value={posCategory} onChange={event=>setPosCategory(event.target.value)}><option value="All">All categories</option>{[...new Set(products.map(product=>product.category))].sort().map(category=><option key={category}>{category}</option>)}</select></label></div>
          <QRScanner onScan={code=>{const product=products.find(item=>(item.sku||'').toLowerCase()===code.toLowerCase()||(item.id||item._id)===code);setPosCategory('All');setSearch(product?product.sku||product.name:code);}}/>
          <p className="pos-result-count">{formatCount(filteredProducts.length,'product')}</p>
          <div className="pos-product-list" role="list" aria-label="Available products"><div className="pos-list-heading" aria-hidden="true"><span>Product</span><span>Price</span><span>Stock</span><span /></div>{filteredProducts.map(product=>{const quantity=cart.find(item=>item.product===product._id)?.quantity||0;return <article role="listitem" key={product._id} className={`pos-list-row ${quantity?'is-selected':''}`}><div className="pos-list-info"><h3>{product.name}</h3><p>{product.sku||product.category}{quantity>0&&<span className="pos-in-order">{quantity} in order</span>}</p><span className={`pos-phone-stock ${product.stock===0?'is-empty':''}`}>{product.stock===0?'Out of stock':`${formatUnits(product.stock)} in stock`}</span></div><strong className="pos-list-price">{formatCurrency(product.price,businessConfig.currency)}</strong><span className={`pos-list-stock ${product.stock===0?'is-empty':''}`}>{product.stock===0?'Out of stock':formatUnits(product.stock)}</span><button type="button" onClick={()=>addToCart(product)} disabled={product.stock===0||quantity>=product.stock} aria-label={`Add ${product.name} to cart`}>Add</button></article>;})}</div>
          {!filteredProducts.length&&<div className="pos-empty-products"><p>No products match this search.</p><button type="button" onClick={()=>{setSearch('');setPosCategory('All');}}>Clear filters</button></div>}
        </section>
        <section id="checkout-panel" ref={checkoutOpen && !invoiceModal && !showCustModal && !historyModal ? overlayRef : undefined} className="pos-checkout" aria-labelledby="pos-order-title"><button className="pos-back-to-products" type="button" onClick={()=>setCheckoutOpen(false)}>Back to products</button>
          <div className="pos-section-heading"><div><span className="pos-step">02 / ORDER</span><h2 id="pos-order-title">Current sale</h2></div><button type="button" disabled={!cart.length} className="pos-clear" onClick={()=>{setCart([]);setDiscount(0);setAmountPaid('');setMsg({text:'',type:''});}}>Clear order</button></div>
          <div className="pos-checkout-body"><div className="pos-cart-items">{cart.map(item=><article key={item.product} className="pos-cart-item"><div className="pos-cart-item-name"><h3>{item.name}</h3><button type="button" aria-label={`Remove ${item.name} from order`} onClick={()=>{setCart(value=>value.filter(product=>product.product!==item.product));if(cart.length===1){setDiscount(0);setAmountPaid('');}}}>Remove</button></div><p>{formatCurrency(item.price,businessConfig.currency)} each</p><div className="pos-cart-item-bottom"><div className="pos-quantity"><button type="button" aria-label={`Decrease quantity of ${item.name}`} onClick={()=>updateQty(item.product,-1)}>−</button><span>{item.quantity}</span><button type="button" aria-label={`Increase quantity of ${item.name}`} disabled={item.quantity>=item.stock} onClick={()=>updateQty(item.product,1)}>+</button></div><strong>{formatCurrency(item.price*item.quantity,businessConfig.currency)}</strong></div></article>)}{!cart.length&&<div className="pos-empty-order"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M5 5h14v16H5zM9 5V3h6v2M8 10h8m-8 4h5"/></svg><strong>Your order starts here</strong><p>Add a product from the catalog.</p></div>}</div>
          <div className="pos-customer"><div className="pos-subheading"><label htmlFor="pos-customer">Customer</label><button type="button" onClick={()=>{setEditingCustomer(null);setCustModalOrigin('pos');setCustForm({name:'',phone:'',email:'',address:''});setShowCustModal(true);}}>+ Add New Customer</button></div><SearchBox value={checkoutCustomerSearch} onChange={setCheckoutCustomerSearch} label="Search checkout customers" placeholder="Customer name, phone, or email"/><select id="pos-customer" aria-label="Select Customer" value={selectedCustomer} onChange={event=>handleSelectCustomer(event.target.value)}><option value="">Walk-in customer</option>{checkoutCustomerOptions.map(customer=><option key={customer._id} value={customer._id}>{customer.name} ({customer.phone})</option>)}</select>{checkoutCustomerSearch.trim() && <p className="pos-customer-search-note" role="status">{checkoutCustomerMatches.length ? `${checkoutCustomerMatches.length} matching customer${checkoutCustomerMatches.length === 1 ? '' : 's'}` : 'No customers match. Clear your search or add a new customer.'}</p>}{!selectedCustomer&&<details className="pos-guest-details"><summary>Add optional customer details</summary><input aria-label="Customer Name" placeholder="Customer name" value={customerName} onChange={event=>setCustomerName(event.target.value)}/><input aria-label="Customer Phone Number" placeholder="Phone number" value={customerPhone} onChange={event=>setCustomerPhone(event.target.value)}/><input type="email" aria-label="Customer Email" placeholder="Email (optional)" value={customerEmail} onChange={event=>setCustomerEmail(event.target.value)}/></details>}</div>
          <div className="pos-payment"><div className="pos-subheading"><h3>Payment</h3><span>{allowDues?'Dues enabled':'Full payment'}</span></div><div className="pos-total-row"><span>Subtotal</span><strong>{formatCurrency(subtotal,businessConfig.currency)}</strong></div><div className="pos-total-row"><label htmlFor="pos-discount-input">Discount</label><input id="pos-discount-input" type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={event=>setDiscount(event.target.value)}/></div><div className="pos-total-row"><span>Tax ({businessConfig.taxRate||0}%)</span><strong>{formatCurrency(taxAmount,businessConfig.currency)}</strong></div><div className="pos-total-row"><label htmlFor="pos-payment-method">Payment method</label><select id="pos-payment-method" value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="bkash">bKash</option><option value="other">Other</option></select></div>
          {allowDues&&<div className="pos-partial-payment"><label htmlFor="pos-amount-paid">Amount paid now</label><input id="pos-amount-paid" type="number" min="0" max={total} step="0.01" placeholder={String(total)} value={amountPaid} onChange={event=>setAmountPaid(event.target.value)}/><p>Balance due: <strong>{formatCurrency(Math.max(0,total-(amountPaid===''?total:Number(amountPaid))),businessConfig.currency)}</strong></p>{!selectedCustomer&&<p>Select a saved customer to record a due.</p>}</div>}
          </div></div><div className="pos-checkout-footer"><div className="pos-grand-total"><span>Total</span><strong>{formatCurrency(total,businessConfig.currency)}</strong></div>{msg.text&&<p role="alert" className={`pos-feedback ${msg.type==='error'?'is-error':''}`}>{msg.text}</p>}<button type="button" onClick={completeSale} disabled={!cart.length||submittingSale||demoReadOnly} className="pos-complete">{submittingSale?'Completing sale…':'Complete Sale'}</button><p className="pos-checkout-note">Review the order before completing the sale.</p></div>
        </section>
      </div>}

      {/* TAB 2: SALES HISTORY */}
      {tab === 'Sales History' && (
        <div className="sales-panel sales-history-panel">
          <div className="sales-panel-heading"><div><h2>Sales history</h2><p>Find an invoice, review a payment, or export your records.</p></div><button type="button" className="sales-secondary-button" aria-label="Download sales report" disabled={exportBusy || historyBusy || Boolean(historyError) || Boolean(periodError)} onClick={exportReport}>{exportBusy ? 'Preparing…' : 'Export CSV'}</button></div>
          <fieldset className="sales-period-filters" disabled={exportBusy}>
            <legend>Report period <span>Bangladesh time</span></legend>
            <label>Period<select aria-label="Period" value={periodMode} onChange={e=>setPeriodMode(e.target.value)}><option value="all">All time</option><option value="month">Month</option><option value="range">Date range</option></select></label>
            {periodMode === 'month' && <label>Month<input aria-label="Month" type="month" min="2000-01" max="2100-12" value={reportMonth} onChange={e=>setReportMonth(e.target.value)}/></label>}
            {periodMode === 'range' && <><label>From<input aria-label="From" type="date" min="2000-01-01" max="2100-12-31" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>To<input aria-label="To" type="date" min={startDate || '2000-01-01'} max="2100-12-31" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></>}
          </fieldset>
          {periodError && <p role="status" className="history-search-status">{periodError}</p>}
          {exportMessage && <p role="status" className="history-search-status">{exportMessage}</p>}
          <div className="history-search-row"><SearchBox value={historySearch} onChange={value=>{if(value.trim()!==historySearch.trim()){salesRequest.current++;setHistoryBusy(true);}setHistorySearch(value);}} label="Search sales history" placeholder="Invoice number, customer name, or phone"/><span role="status" className="history-search-status">{historyBusy ? 'Searching…' : `${sales.length} of ${historyTotal} ${historySearch.trim() ? 'matching' : ''} transactions`}</span></div>
          {historyError && <p role="alert" className="history-search-error">{historyError}</p>}
          <div className="workspace-table-scroll overflow-x-auto" tabIndex={0} aria-label="Sales history results" aria-busy={historyBusy}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b">
                  <th className="text-left py-2.5">Invoice</th>
                  <th className="text-left py-2.5">Customer</th>
                  <th className="text-left py-2.5">Items</th>
                  <th className="text-center py-2.5">Method</th>
                  <th className="text-right py-2.5">Subtotal</th>
                  <th className="text-right py-2.5">Discount</th>
                  <th className="text-right py-2.5">Tax Snapshot</th>
                  <th className="text-right py-2.5">Total</th>
                  <th className="text-right py-2.5">Profit</th>
                  <th className="text-right py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map(s => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => { setCollectError(''); setCollectAmount(''); setInvoiceModal(s); }}
                        className="text-blue-600 hover:underline"
                      >
                        {s.invoiceNumber || 'INV'}
                      </button>
                    </td>
                    <td className="py-3 font-medium text-slate-800">
                      {s.customer?.name || s.customerName || 'Walk-in Customer'}
                    </td>
                    <td className="py-3 text-slate-600">
                      {(s.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ')}
                    </td>
                    <td className="py-3 text-center capitalize text-slate-500">{s.paymentMethod || 'cash'}</td>
                    <td className="py-3 text-right text-slate-700">
                      {formatCurrency(s.subtotal, businessConfig.currency)}
                    </td>
                    <td className="py-3 text-right text-slate-500">
                      {s.discount > 0 ? `-${formatCurrency(s.discount, businessConfig.currency)}` : '—'}
                    </td>
                    <td className="py-3 text-right">{renderPersistedTaxBadge(s)}</td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {formatCurrency(s.total, businessConfig.currency)}{s.due > 0 && <span className="block text-[10px] text-amber-700">Due: {formatCurrency(s.due,businessConfig.currency)}</span>}
                    </td>
                    <td className="py-3 text-right font-semibold text-emerald-600">
                      {formatCurrency(s.profit || 0, businessConfig.currency)}
                    </td>
                    <td className="py-3 text-right text-slate-500">{formatDateTimeBD(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!historyBusy && sales.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400">{historySearch.trim() ? 'No invoices match your search. Try a different invoice, name, or phone.' : 'No sales transactions recorded yet.'}</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CUSTOMERS CRUD & PURCHASE HISTORY */}
      {tab === 'Customers' && (
        <div className="sales-panel sales-customers-panel">
          <div className="sales-panel-heading">
            <div><h2>Customers</h2><p>Contact details, purchase history, and balances in one place.</p></div>
            <button
              onClick={() => {
                setEditingCustomer(null);
                setCustModalOrigin('customers');
                setCustForm({ name: '', phone: '', email: '', address: '' });
                setShowCustModal(true);
              }}
              className="sales-primary-button"
            >
              + Add New Customer
            </button>
          </div>

          <div className="history-search-row"><SearchBox value={custSearch} onChange={setCustSearch} label="Search customers" placeholder="Customer name, phone, or email"/><p role="status" className="history-search-status">{filteredCustomers.length} of {customers.length} loaded customers{custSearch.trim() ? ' match your search' : ''}</p></div>
          <div className="workspace-table-scroll overflow-x-auto" tabIndex={0} aria-label="Scrollable data table">
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
                    <td className="py-3 text-center font-semibold">{formatCount(c.totalOrders || 0, 'order')}</td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {formatCurrency(c.totalSpent || 0, businessConfig.currency)}{c.due > 0 && <span className="block text-[10px] text-amber-700">Due: {formatCurrency(c.due,businessConfig.currency)}</span>}
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
              <div className="text-center py-8 text-xs text-slate-400">{custSearch.trim() ? 'No customers match. Try another name, phone, or email.' : 'No customers yet. Add your first customer to get started.'}</div>
            )}
          </div>
        </div>
      )}

      {invoiceModal && <div ref={overlayRef} role="dialog" aria-modal="true" aria-label="Invoice details" className="workspace-dialog fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><div className="cash-memo-dialog bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90svh] overflow-y-auto"><CashMemo sale={invoiceModal} business={businessConfig}/><div className="cash-memo-collection">{isDemoSandbox() && invoiceModal.due>0 && <form className="space-y-2 text-xs" onSubmit={async event=>{event.preventDefault();if(!await confirm({title:'Record payment?',message:`Record ${formatCurrency(Number(collectAmount),businessConfig.currency)} against ${invoiceModal.invoiceNumber}? This reduces the outstanding customer balance. Confirm only after receiving the payment.`,confirmLabel:'Confirm payment received'}))return;setPaymentBusy(true);setCollectError('');try{const {data}=await api.post(`/sales/${invoiceModal.id||invoiceModal._id}/payments`,{amount:Number(collectAmount)});setInvoiceModal(data);setCollectAmount('');await loadAll();}catch(error){setCollectError(error.response?.data?.message||'Could not collect payment.');}finally{setPaymentBusy(false);}}}><label htmlFor="collect-due">Collect due payment</label><div className="flex gap-2"><input id="collect-due" required type="number" min="0.01" max={invoiceModal.due} step="0.01" value={collectAmount} onChange={event=>setCollectAmount(event.target.value)} className="border rounded-lg p-2 min-w-0 flex-1"/><button disabled={paymentBusy} className="bg-blue-600 text-white rounded-lg px-3">{paymentBusy?'Saving…':'Collect'}</button></div></form>}{collectError&&<p role="alert" className="text-red-700 text-xs">{collectError}</p>}</div><div className="cash-memo-actions"><button type="button" onClick={()=>{if(!printCashMemo(invoiceModal,businessConfig))setCollectError('Allow popups to open the cash memo.');}}>Print cash memo / Save PDF</button><button type="button" onClick={()=>setInvoiceModal(null)} aria-label="Close invoice details">Close</button></div></div></div>}

      {/* Customer Create/Edit Modal */}
      {showCustModal && (
        <div ref={overlayRef} role="dialog" aria-modal="true" aria-label={invoiceModal ? 'Invoice details' : showCustModal ? 'Customer editor' : 'Customer history'} className="workspace-dialog fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <form onSubmit={handleSaveCustomer} className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3 text-xs">
            <h3 className="font-bold text-base text-slate-900">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h3>
            <input
              required
              placeholder="Customer Name"
              aria-label="Customer Name"
              value={custForm.name}
              onChange={e => setCustForm({ ...custForm, name: e.target.value })}
              className="w-full border rounded-xl px-3 py-2"
            />
            <input
              required
              placeholder="Phone Number"
              aria-label="Phone Number"
              value={custForm.phone}
              onChange={e => setCustForm({ ...custForm, phone: e.target.value })}
              className="w-full border rounded-xl px-3 py-2"
            />
            <input
              type="email"
              placeholder="Email (Optional)"
              aria-label="Email"
              value={custForm.email}
              onChange={e => setCustForm({ ...custForm, email: e.target.value })}
              className="w-full border rounded-xl px-3 py-2"
            />
            <input
              placeholder="Address (Optional)"
              aria-label="Address"
              value={custForm.address}
              onChange={e => setCustForm({ ...custForm, address: e.target.value })}
              className="w-full border rounded-xl px-3 py-2"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCustModal(false)} className="px-4 py-2 border rounded-xl">
                Cancel
              </button>
              <button type="submit" disabled={demoReadOnly} className="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold">
                Save Customer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Purchase History Modal */}
      {historyModal && (
        <div ref={overlayRef} role="dialog" aria-modal="true" aria-label={invoiceModal ? 'Invoice details' : showCustModal ? 'Customer editor' : 'Customer history'} className="workspace-dialog fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-3 text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {historyModal.customer.name} — Purchase History ({formatCount(historyModal.purchaseHistory?.length || 0, 'order')})
                </h3>
                <p className="text-slate-500">
                  {historyModal.customer.phone} · Total Spent:{' '}
                  {formatCurrency(historyModal.customer.totalSpent || 0, businessConfig.currency)}
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
                    {s.taxAmount !== null && s.taxAmount !== undefined && (
                      <div className="text-[11px] text-slate-400">
                        Subtotal: {formatCurrency(s.subtotal, businessConfig.currency)} · Tax ({s.taxRate ?? 0}%):{' '}
                        {formatCurrency(s.taxAmount, businessConfig.currency)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900">
                      {formatCurrency(s.total, businessConfig.currency)}
                    </div>
                    <div className="text-slate-400">{formatDateTimeBD(s.createdAt)}</div>
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
