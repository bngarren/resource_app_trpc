import { format, formatDuration } from "date-fns";

/**
 * ### Gets our custom prettified date string
 * e.g. `10 Oct 14:30:45`
 * @param date
 * @returns
 */
export const pdate = (date: Date | null | undefined) => {
  if (date) {
    return format(date, "dd LLL HH:mm:ss");
  } else {
    return null;
  }
};

/**
 * ### Returns a human readable duration from input in milliseconds
 * e.g. `1 day, 6 hours, 20 minutes, 10 seconds"
 * @param milliseconds
 */
export const pduration = (milliseconds: number) => {
  let runningMilliseconds = milliseconds;

  const days = Math.floor(milliseconds / (60000.0 * 60.0 * 24));
  runningMilliseconds -= days * 60000.0 * 60.0 * 24;

  const hours = Math.floor(runningMilliseconds / (60000.0 * 60.0));
  runningMilliseconds -= hours * 60000.0 * 60.0;

  const minutes = Math.floor(runningMilliseconds / 60000.0);
  runningMilliseconds -= minutes * 60000.0;

  const seconds = Math.floor(runningMilliseconds / 1000.0);

  return formatDuration({ days, hours, minutes, seconds }, { delimiter: ", " });
};
