declare module "nepali-date-converter" {
  export default class NepaliDate {
    constructor(value: Date | string | number);
    constructor(year: number, month: number, day: number);
    getYear(): number;
    /** 0-indexed month (0 = Baisakh) */
    getMonth(): number;
    getDate(): number;
    getDay(): number;
    /** Gregorian Date for this BS date (NPT midnight expressed in UTC). */
    toJsDate(): Date;
    getDateObject(): Date;
    getAD(): { year: number; month: number; date: number; day: number };
    getBS(): { year: number; month: number; date: number; day: number };
    setDate(day: number): void;
    setMonth(month: number): void;
    setYear(year: number): void;
    format(formatString: string): string;
    valueOf(): number;
    toString(): string;
  }
}
