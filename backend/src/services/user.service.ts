import { supabaseAdmin } from '../config/supabase';
import { CreateUserInput, UpdateUserInput, ListUsersQuery } from '../validators/user.validator';

const toUser = (row: any) => ({ id: row.id, email: row.email, fullName: row.full_name, role: row.role, isActive: row.is_active, createdAt: row.created_at, updatedAt: row.updated_at });

export class UserService {
  static async listUsers(query: ListUsersQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    let request = supabaseAdmin.from('users').select('*', { count: 'exact' }).range((page - 1) * limit, page * limit - 1).order('created_at', { ascending: false });
    if (query.role) request = request.eq('role', query.role);
    if (query.isActive !== undefined) request = request.eq('is_active', query.isActive === 'true');
    if (query.search) request = request.or(`email.ilike.%${query.search}%,full_name.ilike.%${query.search}%`);
    const { data, error, count } = await request;
    if (error) throw new Error(error.message);
    const total = count || 0;
    const totalPages = Math.ceil(total / limit);
    return { users: (data || []).map(toUser), pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 } };
  }

  static async createUser(input: CreateUserInput) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
    if (authError || !authData.user) throw new Error(authError?.message || 'Failed to create authentication user');
    const { data, error } = await supabaseAdmin.from('users').insert({ id: authData.user.id, email: input.email, full_name: input.fullName, role: input.role, is_active: input.isActive ?? true }).select().single();
    if (error) { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); throw new Error(error.message); }
    return toUser(data);
  }

  static async updateUser(userId: string, input: UpdateUserInput) {
    const { data, error } = await supabaseAdmin.from('users').update({ ...(input.fullName !== undefined && { full_name: input.fullName }), ...(input.role !== undefined && { role: input.role }) }).eq('id', userId).select().single();
    if (error || !data) throw new Error('User not found');
    return toUser(data);
  }

  static async updateStatus(userId: string, isActive: boolean) {
    const { data, error } = await supabaseAdmin.from('users').update({ is_active: isActive }).eq('id', userId).select().single();
    if (error || !data) throw new Error('User not found');
    return toUser(data);
  }
}
