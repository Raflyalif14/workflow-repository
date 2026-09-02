import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import {
  generateInitialPassword,
  isDuplicateAuthError,
  normalizeRegisterEmail,
  validateInitialPassword,
  validateInternalEmailDomain,
} from './auth.service';
import { EmailService, InitialPasswordEmailInput } from './email.service';
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from '../validators/user.validator';
import { UserRole } from '../validators/auth.validator';

type PublicUserRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean | null;
  created_at: string;
  updated_at: string | null;
};

type CreatePublicUserInput = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: true;
  initial_password_sent_at: null;
};

export type AdminUserCreationDependencies = {
  internalEmailDomain: string;
  findPublicUserByEmail: (email: string) => Promise<boolean>;
  createAuthUser: (email: string, password: string) => Promise<{ id: string }>;
  deleteAuthUser: (userId: string) => Promise<void>;
  createPublicUser: (input: CreatePublicUserInput) => Promise<PublicUserRow>;
  deletePublicUser: (userId: string) => Promise<void>;
  sendInitialPasswordEmail: (input: InitialPasswordEmailInput) => Promise<unknown>;
  updateInitialPasswordSentAt: (userId: string, sentAt: string) => Promise<void>;
  generatePassword?: () => string;
  now?: () => string;
};

const userFields = 'id,email,full_name,role,is_active,must_change_password,created_at,updated_at';

const toUser = (row: PublicUserRow) => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  isActive: row.is_active,
  mustChangePassword: row.must_change_password ?? false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class UserServiceError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'UserServiceError';
  }
}

const createGenericUserError = (context: string): UserServiceError => {
  console.error(`[UserService] ${context}`);
  return new UserServiceError('Failed to create user.', 500);
};

const compensate = async (operation: () => Promise<void>, context: string): Promise<void> => {
  try {
    await operation();
  } catch {
    console.warn(`[UserService] ${context}`);
  }
};

export async function createAdminUserWithDependencies(
  input: CreateUserInput,
  deps: AdminUserCreationDependencies
) {
  const email = normalizeRegisterEmail(input.email);
  const fullName = input.fullName.trim();

  if (!fullName) throw new UserServiceError('Full name is required.');

  let isInternalEmail: boolean;
  try {
    isInternalEmail = validateInternalEmailDomain(email, deps.internalEmailDomain);
  } catch {
    throw createGenericUserError('Failed to validate the internal email domain.');
  }
  if (!isInternalEmail) throw new UserServiceError('Email must use the internal company domain.');

  try {
    if (await deps.findPublicUserByEmail(email)) {
      throw new UserServiceError('Email is already registered.', 409);
    }
  } catch (error) {
    if (error instanceof UserServiceError) throw error;
    throw createGenericUserError('Failed to check whether the email is registered.');
  }

  const initialPassword = deps.generatePassword ? deps.generatePassword() : generateInitialPassword();
  if (!Object.values(validateInitialPassword(initialPassword)).every(Boolean)) {
    throw createGenericUserError('Generated initial password did not meet the required policy.');
  }

  let authUser: { id: string };
  try {
    authUser = await deps.createAuthUser(email, initialPassword);
  } catch (error) {
    if (isDuplicateAuthError(error)) throw new UserServiceError('Email is already registered.', 409);
    throw createGenericUserError('Failed to create the authentication user.');
  }

  let publicUser: PublicUserRow;
  try {
    publicUser = await deps.createPublicUser({
      id: authUser.id,
      email,
      full_name: fullName,
      role: input.role,
      is_active: input.isActive,
      must_change_password: true,
      initial_password_sent_at: null,
    });
  } catch {
    await compensate(() => deps.deleteAuthUser(authUser.id), 'Failed to compensate authentication user after profile creation failure.');
    throw createGenericUserError('Failed to create the public user profile.');
  }

  try {
    await deps.sendInitialPasswordEmail({
      recipientEmail: email,
      recipientName: fullName,
      initialPassword,
    });
  } catch {
    await compensate(() => deps.deletePublicUser(publicUser.id), 'Failed to compensate public user after email delivery failure.');
    await compensate(() => deps.deleteAuthUser(authUser.id), 'Failed to compensate authentication user after email delivery failure.');
    throw createGenericUserError('Failed to send the initial password email.');
  }

  try {
    await deps.updateInitialPasswordSentAt(publicUser.id, deps.now ? deps.now() : new Date().toISOString());
  } catch {
    console.warn('[UserService] Failed to update the initial password sent timestamp.');
  }

  return toUser(publicUser);
}

export class UserService {
  static async listUsers(query: ListUsersQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    let request: any = supabaseAdmin
      .from('users')
      .select(userFields, { count: 'exact' })
      .range((page - 1) * limit, page * limit - 1)
      .order('created_at', { ascending: false });

    if (query.role) request = request.eq('role', query.role);
    if (query.isActive !== undefined) request = request.eq('is_active', query.isActive === 'true');
    if (query.search) request = request.or(`email.ilike.%${query.search}%,full_name.ilike.%${query.search}%`);

    const { data, error, count } = await request;
    if (error) {
      console.error('[UserService] Failed to retrieve users.');
      throw new UserServiceError('Failed to retrieve users.', 500);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);
    return {
      users: ((data || []) as PublicUserRow[]).map(toUser),
      pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  static async createUser(input: CreateUserInput) {
    return createAdminUserWithDependencies(input, {
      internalEmailDomain: ENV.INTERNAL_EMAIL_DOMAIN,
      findPublicUserByEmail: async (email) => {
        const { data, error } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle();
        if (error) throw error;
        return Boolean(data);
      },
      createAuthUser: async (email, password) => {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error || !data.user) throw error || new Error('Authentication user was not created.');
        return { id: data.user.id };
      },
      deleteAuthUser: async (userId) => {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;
      },
      createPublicUser: async (user) => {
        const { data, error } = await supabaseAdmin
          .from('users')
          .insert(user)
          .select(userFields)
          .single();

        if (error || !data) throw error || new Error('Public user profile was not created.');
        return data as PublicUserRow;
      },
      deletePublicUser: async (userId) => {
        const { error } = await supabaseAdmin.from('users').delete().eq('id', userId);
        if (error) throw error;
      },
      sendInitialPasswordEmail: (emailInput) => EmailService.sendInitialPasswordEmail(emailInput),
      updateInitialPasswordSentAt: async (userId, sentAt) => {
        const { error } = await supabaseAdmin
          .from('users')
          .update({ initial_password_sent_at: sentAt })
          .eq('id', userId);

        if (error) throw error;
      },
    });
  }

  static async updateUser(userId: string, input: UpdateUserInput) {
    const changes: { full_name?: string; role?: UserRole; is_active?: boolean } = {};
    if (input.fullName !== undefined) changes.full_name = input.fullName.trim();
    if (input.role !== undefined) changes.role = input.role;
    if (input.isActive !== undefined) changes.is_active = input.isActive;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(changes)
      .eq('id', userId)
      .select(userFields)
      .maybeSingle();

    if (!data) {
      if (error) {
        console.error('[UserService] Failed to update user.');
        throw new UserServiceError('Failed to update user.', 500);
      }
      throw new UserServiceError('User not found.', 404);
    }
    if (error) {
      console.error('[UserService] Failed to update user.');
      throw new UserServiceError('Failed to update user.', 500);
    }
    return toUser(data as PublicUserRow);
  }

  static async updateStatus(userId: string, isActive: boolean) {
    if (typeof isActive !== 'boolean') throw new UserServiceError('isActive must be a boolean.');

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ is_active: isActive })
      .eq('id', userId)
      .select(userFields)
      .maybeSingle();

    if (!data) {
      if (error) {
        console.error('[UserService] Failed to update user status.');
        throw new UserServiceError('Failed to update user.', 500);
      }
      throw new UserServiceError('User not found.', 404);
    }
    if (error) {
      console.error('[UserService] Failed to update user status.');
      throw new UserServiceError('Failed to update user.', 500);
    }
    return toUser(data as PublicUserRow);
  }
}
