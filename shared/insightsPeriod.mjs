import { salesPeriod } from './salesPeriod.mjs';
const DAY=86400000;
export function insightsPeriod(query={}, now=new Date()) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  let period;
  if(query.month || query.startDate || query.endDate) period=salesPeriod(query);
  else {
    const days=Number(query.days||30);
    if(![7,30,90].includes(days)) throw Object.assign(new Error('Choose 7, 30, or 90 days.'),{status:400});
    const end=salesPeriod({startDate:today,endDate:today}).end;
    period={start:end-days*DAY,end};
  }
  const todayEnd=salesPeriod({startDate:today,endDate:today}).end;
  if(period.start>=todayEnd) throw Object.assign(new Error('Choose a period starting today or earlier.'),{status:400});
  period.end=Math.min(period.end,todayEnd);
  const days=Math.round((period.end-period.start)/DAY);
  if(days>366) throw Object.assign(new Error('Choose a period of up to 366 days.'),{status:400});
  const date=value=>new Date(value+6*3600000).toISOString().slice(0,10);
  return {...period,days,startDate:date(period.start),endDate:date(period.end-DAY),label:`${date(period.start)} to ${date(period.end-DAY)}`,previousStart:period.start-days*DAY};
}
