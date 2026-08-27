import { supabaseAdmin } from '../config/supabase';

export class HolidayService {
  static async getActiveHolidays() {
    const { data, error } = await supabaseAdmin
      .from('holidays')
      .select('date')
      .eq('is_active', true)
      .order('date', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map((holiday) => holiday.date as string);
  }

  static async getActiveHolidaysBetween(startDate: string, estimatedEndDate: string) {
    const { data, error } = await supabaseAdmin
      .from('holidays')
      .select('date')
      .eq('is_active', true)
      .gte('date', startDate)
      .lte('date', estimatedEndDate)
      .order('date', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map((holiday) => holiday.date as string);
  }
}
