// Parse date-specific Google Places (New) currentOpeningHours periods without
// treating generic weekday labels as proof of special-day hours.
import {hourText,local} from './shared.js';

const dateKey = point => {
  const d=point?.date;
  if(!d||!Number.isInteger(d.year)||!Number.isInteger(d.month)||!Number.isInteger(d.day))return null;
  return [d.year,String(d.month).padStart(2,'0'),String(d.day).padStart(2,'0')].join('-');
};
const minute = point => (Number.isInteger(point?.hour)?point.hour:0)*60+
  (Number.isInteger(point?.minute)?point.minute:0);
const dateMs = day => Date.parse(day+'T00:00:00Z');
const segment = (first,last) => {
  if(first===0 && last===1440)return 'Open 24 hours';
  const open=hourText(first);
  const close=last===1440?'12:00 AM (+1 day)':hourText(last);
  return open+' – '+close;
};

/** A Google period belongs to a concrete local calendar date, including special days.
 * Returns a non-misleading label for the selected suggestion date. Never cached in KV.
 */
export function hoursForDate(hours, selectedDate, today=local().date) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate||''))
    return {label:'Opening hours unverified',verified:false};
  if(!hours||!Array.isArray(hours.periods))
    return {label:'Opening hours unverified',verified:false};
  const dayDistance=(dateMs(selectedDate)-dateMs(today))/86400000;
  // currentOpeningHours only guarantees the next seven calendar days.
  if(dayDistance < 0 || dayDistance>6)
    return {label:'Hours for that date unavailable — refresh',verified:false};

  const range=[];
  for(const period of hours.periods){
    const start=dateKey(period.open),end=dateKey(period.close);
    if(!start)continue;
    let a;
    if(start<selectedDate)a=0;
    else if(start===selectedDate)a=minute(period.open);
    else continue;
    let b;
    if(!period.close)b=1440;
    else if(!end)continue;
    else if(end>selectedDate)b=1440;
    else if(end===selectedDate)b=minute(period.close);
    else continue;
    if(b>a)range.push([Math.max(0,a),Math.min(1440,b)]);
  }
  if(!range.length){
    return {label:'Closed on selected day (Google hours)',verified:true};
  }
  range.sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const [a,b] of range){
    if(merged.length && merged.at(-1)[1]>=a) merged.at(-1)[1]=Math.max(b,merged.at(-1)[1]);
    else merged.push([a,b]);
  }
  return {label:merged.map(([a,b])=>segment(a,b)).join(' / '),verified:true};
}
