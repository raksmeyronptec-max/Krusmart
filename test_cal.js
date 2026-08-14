const { toKhmerLunarDate, formatKhmerDate } = require('khmer-chhankitek-calendar');

const date = new Date('2026-06-16');
console.log(toKhmerLunarDate(date));
console.log(formatKhmerDate(date));
