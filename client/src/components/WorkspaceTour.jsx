import { useState } from 'react';

const screens = [
  { label: 'Inventory', image: 'inventory-preview.png', description: 'Products, stock levels, and movement history in one view.' },
  { label: 'Sales', image: 'dashboard-preview.png', description: 'Sales performance and recent transactions at a glance.' },
  { label: 'Customers', image: 'customers-preview.png', description: 'Customer records and their purchase history, connected.' },
  { label: 'Insights', image: 'insights-preview.png', description: 'Demand estimates and restock suggestions. Forecasts are estimates, not guarantees.' },
];

export default function WorkspaceTour() {
  const [active, setActive] = useState(0);
  return <div className="workspace-simple">
    <div className="workspace-simple-nav" role="group" aria-label="Workspace previews">{screens.map((screen, index) => <button key={screen.label} type="button" aria-pressed={active === index} onClick={() => setActive(index)}>{screen.label}</button>)}</div>
    <figure className="workspace-simple-preview"><img src={`/images/${screens[active].image}`} alt={screens[active].description} width="1440" height="1000" loading="lazy" /><figcaption><span>{screens[active].description}</span><span>Fictional demo data</span></figcaption></figure>
    <details className="workspace-watch"><summary>Watch the workspace walkthrough <span>89 seconds</span></summary><video controls playsInline preload="none" poster="/images/dashboard-preview.png" aria-label="StockWise workspace walkthrough"><source src="/media/stockwise-walkthrough.webm" type="video/webm" />Your browser does not support this video.</video><p>Silent walkthrough with captions · Fictional demo data</p></details>
  </div>;
}
