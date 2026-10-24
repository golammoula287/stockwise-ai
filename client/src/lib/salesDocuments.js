import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CashMemo, { cashMemoStyles } from '../components/CashMemo';
import { formatCurrency } from './formatters';
export function downloadSalesReport(sales, currency, periodLabel = 'all-time') {
  const cell=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const rows=[['Invoice','Date','Customer','Currency','Total','Paid','Due','Payment method'],...sales.map(s=>[s.invoiceNumber,s.createdAt,s.customerName,currency,s.total,s.amountPaid??s.total,s.due||0,s.paymentMethod])];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`stockwise-sales-report-${periodLabel}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function printCashMemo(sale, business) {
  const popup=window.open('','_blank','width=800,height=850');if(!popup)return false;
  popup.opener=null;const doc=popup.document;doc.title=`Cash memo ${sale.invoiceNumber}`;
  const style=doc.createElement('style');style.textContent='body{margin:0;background:#eef1f6;padding:30px}.print-sheet{max-width:760px;margin:auto;background:white;box-shadow:0 8px 35px #09154012}.memo-print-control{display:block;margin:0 auto 20px;padding:10px 22px;border:1px solid #dce2ec;border-radius:5px;background:white;color:#18233b;cursor:pointer}@media print{body{padding:0;background:white}.print-sheet{box-shadow:none}.memo-print-control{display:none}}';style.textContent += cashMemoStyles;doc.head.append(style);
  const button=doc.createElement('button');button.className='memo-print-control';button.textContent='Print / Save PDF';button.onclick=()=>popup.print();doc.body.append(button);
  const sheet=doc.createElement('div');sheet.className='print-sheet';sheet.innerHTML=renderToStaticMarkup(createElement(CashMemo,{sale,business,includeStyles:false}));doc.body.append(sheet);popup.focus();return true;
}
