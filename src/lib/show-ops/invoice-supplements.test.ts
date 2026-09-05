import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingExtrasSummary, invoiceSupplements } from './invoice-supplements';
import { sumInvoiceLines } from './invoice';

test('extras and paid infant tickets retain their agreed invoice totals', () => {
 const lines=invoiceSupplements({extras:[{name:'Meal',quantity:3,nett_total:19.99}],infantNett:5,infants:1,booked:4,missing:0,writeOff:false,vatRate:0});
 assert.equal(sumInvoiceLines(lines.map(x=>x.money)).grandTotal,24.99);
 assert.equal(lines[1].description,'Meal × 3');
 assert.equal(lines[1].money.quantity,1);
 assert.equal(bookingExtrasSummary([{name:'Meal',quantity:3}]),'Meal × 3');
});
test('no-show write-off applies the existing proportional rule to extras',()=>{
 const lines=invoiceSupplements({extras:[{name:'Meal',quantity:4,nett_total:40}],infantNett:0,infants:0,booked:4,missing:1,writeOff:true,vatRate:10});
 assert.equal(lines[0].money.netTotal,30);assert.equal(lines[0].money.lineTotal,33);
});
test('invalid extra evidence blocks invoicing instead of silently dropping the charge',()=>{
 assert.throws(()=>invoiceSupplements({extras:[{name:'Meal',quantity:1,nett_total:'invalid'}],infantNett:0,infants:0,booked:1,missing:0,writeOff:false,vatRate:0}));
});
