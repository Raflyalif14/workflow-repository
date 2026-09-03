import crypto from 'crypto';
import { supabaseAdmin, supabaseAuth } from '../config/supabase';
import { ENV } from '../config/env';
import {
  ChangeInitialPasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UserRole,
} from '../validators/auth.validator';
import { EmailService, InitialPasswordEmailInput, PasswordResetEmailInput } from './email.service';

const toProfile = (row: any) => ({
  id: row.id,
  email: row.email,
  full_name: row.full_name,
  fullName: row.full_name,
  role: row.role,
  is_active: row.is_active,
  isActive: row.is_active,
  must_change_password: row.must_change_password ?? false,
  mustChangePassword: row.must_change_password ?? false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type RegisterPublicUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  initial_password_sent_at: string | null;
};

type PublicUserSecurityState = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  must_change_password?: boolean;
};

type CreatePublicUserInput = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: true;
  must_change_password: true;
  initial_password_sent_at: null;
};

export type RegisterDependencies = {
  internalEmailDomain: string;
  defaultRegisterRole: UserRole;
  findPublicUserByEmail: (email: string) => Promise<boolean>;
  createAuthUser: (email: string, password: string) => Promise<{ id: string }>;
  deleteAuthUser: (userId: string) => Promise<void>;
  createPublicUser: (input: CreatePublicUserInput) => Promise<RegisterPublicUser>;
  deletePublicUser: (userId: string) => Promise<void>;
  sendInitialPasswordEmail: (input: InitialPasswordEmailInput) => Promise<unknown>;
  updateInitialPasswordSentAt: (userId: string, sentAt: string) => Promise<void>;
  generatePassword?: () => string;
  now?: () => string;
};

export type ChangeInitialPasswordDependencies = {
  getUserPasswordFlag: (userId: string) => Promise<boolean>;
  updateAuthPassword: (userId: string, newPassword: string) => Promise<void>;
  updateMustChangePassword: (userId: string) => Promise<void>;
};

export type ForgotPasswordDependencies = {
  internalEmailDomain: string;
  passwordResetUrl: string;
  findPublicUserByEmail: (email: string) => Promise<PublicUserSecurityState | null>;
  generateRecoveryTokenHash: (email: string) => Promise<string>;
  sendPasswordResetEmail: (input: PasswordResetEmailInput) => Promise<unknown>;
};

export type ResetPasswordDependencies = {
  verifyRecoveryToken: (tokenHash: string) => Promise<{ userId: string }>;
  getPublicUserById: (userId: string) => Promise<PublicUserSecurityState | null>;
  updateAuthPassword: (userId: string, newPassword: string) => Promise<void>;
  updateMustChangePassword: (userId: string) => Promise<void>;
};

const passwordChars = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  number: '23456789',
  special: '!@#$%^&*()-_=+[]{}',
};

const allPasswordChars = Object.values(passwordChars).join('');
const pickSecureChar = (chars: string) => chars[crypto.randomInt(0, chars.length)];

export function generateInitialPassword(length = 16) {
  if (length < 12) throw new Error('Initial password length must be at least 12 characters');

  const required = [
    pickSecureChar(passwordChars.uppercase),
    pickSecureChar(passwordChars.lowercase),
    pickSecureChar(passwordChars.number),
    pickSecureChar(passwordChars.special),
  ];

  const remaining = Array.from({ length: length - required.length }, () => pickSecureChar(allPasswordChars));
  const chars = [...required, ...remaining];

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join('');
}

export function validateInitialPassword(password: string) {
  return {
    minLength: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function validateNewPasswordPolicy(password: string) {
  if (typeof password !== 'string') throw new Error('new_password is required');
  if (!password.trim()) throw new Error('new_password is required');
  if (password !== password.trim()) throw new Error('new_password must not have leading or trailing whitespace');

  const rules = validateInitialPassword(password);
  if (!Object.values(rules).every(Boolean)) {
    throw new Error('Password must be at least 12 characters and include uppercase, lowercase, number, and special character.');
  }

  return true;
}

export function normalizeRegisterEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateInternalEmailDomain(email: string, internalEmailDomain: string) {
  const normalizedDomain = internalEmailDomain.trim().toLowerCase();
  if (!normalizedDomain) throw new Error('INTERNAL_EMAIL_DOMAIN is required');
  return normalizeRegisterEmail(email).endsWith(`@${normalizedDomain}`);
}

export function parseDefaultRegisterRole(role: string): UserRole {
  if (role !== 'SA') {
    throw new Error('DEFAULT_REGISTER_ROLE must be SA for public registration.');
  }
  return 'SA';
}

const forgotPasswordGenericResponse = {
  message: 'If an account exists, password reset instructions have been sent.',
};

export function buildPasswordResetUrl(passwordResetUrl: string, tokenHash: string) {
  const url = new URL(passwordResetUrl);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', 'recovery');
  return url.toString();
}

export function buildForgotPasswordResponse() {
  return forgotPasswordGenericResponse;
}

export const isDuplicateAuthError = (error: unknown) => {
  const candidate = error as { message?: unknown; status?: unknown } | null;
  const message = String(candidate?.message || '').toLowerCase();
  return message.includes('already') || message.includes('registered') || candidate?.status === 422;
};

export function buildLoginResult(row: any, session: { access_token: string; refresh_token: string }) {
  return {
    user: toProfile(row),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

export async function registerUserWithDependencies(input: RegisterInput, deps: RegisterDependencies) {
  const email = normalizeRegisterEmail(input.email);
  const fullName = input.full_name.trim();
  const role = parseDefaultRegisterRole(deps.defaultRegisterRole);

  if (!fullName) throw new Error('Full name is required');
  if (!validateInternalEmailDomain(email, deps.internalEmailDomain)) {
    throw new Error('Email must use the internal company domain.');
  }

  const duplicatePublicUser = await deps.findPublicUserByEmail(email);
  if (duplicatePublicUser) throw new Error('Email is already registered.');

  const initialPassword = deps.generatePassword ? deps.generatePassword() : generateInitialPassword();
  const passwordValidation = validateInitialPassword(initialPassword);
  if (!Object.values(passwordValidation).every(Boolean)) {
    throw new Error('Generated initial password does not meet security requirements.');
  }

  const authUser = await deps.createAuthUser(email, initialPassword);
  let publicUser: RegisterPublicUser | null = null;

  try {
    publicUser = await deps.createPublicUser({
      id: authUser.id,
      email,
      full_name: fullName,
      role,
      is_active: true,
      must_change_password: true,
      initial_password_sent_at: null,
    });
  } catch (error) {
    await deps.deleteAuthUser(authUser.id);
    throw error;
  }

  try {
    await deps.sendInitialPasswordEmail({
      recipientEmail: email,
      recipientName: fullName,
      initialPassword,
    });
  } catch {
    await deps.deletePublicUser(publicUser.id);
    await deps.deleteAuthUser(authUser.id);
    throw new Error('Failed to send initial password email.');
  }

  const sentAt = deps.now ? deps.now() : new Date().toISOString();
  try {
    await deps.updateInitialPasswordSentAt(publicUser.id, sentAt);
    publicUser = { ...publicUser, initial_password_sent_at: sentAt };
  } catch {
    console.warn('Failed to update initial password sent timestamp for registered user.');
  }

  return {
    id: publicUser.id,
    email: publicUser.email,
    full_name: publicUser.full_name,
    role: publicUser.role,
    must_change_password: publicUser.must_change_password,
    initial_password_email_sent: true,
  };
}

export async function changeInitialPasswordWithDependencies(
  userId: string,
  input: ChangeInitialPasswordInput,
  deps: ChangeInitialPasswordDependencies
) {
  validateNewPasswordPolicy(input.new_password);

  const mustChangePassword = await deps.getUserPasswordFlag(userId);
  if (!mustChangePassword) throw new Error('Initial password has already been changed.');

  await deps.updateAuthPassword(userId, input.new_password);
  await deps.updateMustChangePassword(userId);

  return {
    message: 'Password changed successfully.',
    must_change_password: false,
  };
}

export async function forgotPasswordWithDependencies(input: ForgotPasswordInput, deps: ForgotPasswordDependencies) {
  const email = normalizeRegisterEmail(input.email);

  try {
    if (!validateInternalEmailDomain(email, deps.internalEmailDomain)) return buildForgotPasswordResponse();

    const user = await deps.findPublicUserByEmail(email);
    if (!user || !user.is_active) return buildForgotPasswordResponse();

    const tokenHash = await deps.generateRecoveryTokenHash(email);
    const resetUrl = buildPasswordResetUrl(deps.passwordResetUrl, tokenHash);
    await deps.sendPasswordResetEmail({
      recipientEmail: user.email,
      recipientName: user.full_name,
      resetUrl,
    });
  } catch {
    console.warn('Password reset request could not be completed safely.');
  }

  return buildForgotPasswordResponse();
}

export async function resetPasswordWithDependencies(input: ResetPasswordInput, deps: ResetPasswordDependencies) {
  validateNewPasswordPolicy(input.new_password);

  let verifiedUserId: string;
  try {
    const verified = await deps.verifyRecoveryToken(input.token_hash);
    verifiedUserId = verified.userId;
  } catch {
    throw new Error('Invalid or expired password reset token.');
  }

  const user = await deps.getPublicUserById(verifiedUserId);
  if (!user || !user.is_active) throw new Error('Invalid or expired password reset token.');

  await deps.updateAuthPassword(verifiedUserId, input.new_password);

  try {
    await deps.updateMustChangePassword(verifiedUserId);
  } catch {
    console.warn('Failed to update must_change_password after password reset.');
    throw new Error('Failed to complete password reset.');
  }

  return {
    message: 'Password reset successfully.',
  };
}

export class AuthService {
  static async register(input: RegisterInput) {
    return registerUserWithDependencies(input, {
      internalEmailDomain: ENV.INTERNAL_EMAIL_DOMAIN,
      defaultRegisterRole: ENV.DEFAULT_REGISTER_ROLE,
      findPublicUserByEmail: async (email) => {
        const { data, error } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle();
        if (error) {
          console.error('[AuthService] Failed to check registration email.');
          throw new Error('Failed to create user.');
        }
        return Boolean(data);
      },
      createAuthUser: async (email, password) => {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error || !data.user) {
          if (isDuplicateAuthError(error)) throw new Error('Email is already registered.');
          throw new Error('Failed to create user account.');
        }

        return { id: data.user.id };
      },
      deleteAuthUser: async (userId) => {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) console.warn('Failed to compensate authentication user during registration.');
      },
      createPublicUser: async (user) => {
        const { data, error } = await supabaseAdmin
          .from('users')
          .insert(user)
          .select('id,email,full_name,role,is_active,must_change_password,initial_password_sent_at')
          .single();

        if (error || !data) throw new Error('Failed to create user profile.');
        return data as RegisterPublicUser;
      },
      deletePublicUser: async (userId) => {
        const { error } = await supabaseAdmin.from('users').delete().eq('id', userId);
        if (error) console.warn('Failed to compensate public user during registration.');
      },
      sendInitialPasswordEmail: (emailInput) => EmailService.sendInitialPasswordEmail(emailInput),
      updateInitialPasswordSentAt: async (userId, sentAt) => {
        const { error } = await supabaseAdmin
          .from('users')
          .update({ initial_password_sent_at: sentAt })
          .eq('id', userId);

        if (error) throw new Error(error.message);
      },
    });
  }

  static async login(input: LoginInput) {
    const { data, error } = await supabaseAuth.auth.signInWithPassword(input);
    if (error || !data.session || !data.user) throw new Error('Invalid email or password');
    const { data: row, error: profileError } = await supabaseAdmin.from('users').select('*').eq('id', data.user.id).single();
    if (profileError || !row || !row.is_active) throw new Error('User account is inactive or profile is missing');
    return buildLoginResult(row, data.session);
  }

  static async changeInitialPassword(userId: string, input: ChangeInitialPasswordInput) {
    return changeInitialPasswordWithDependencies(userId, input, {
      getUserPasswordFlag: async (id) => {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('id,must_change_password')
          .eq('id', id)
          .single();

        if (error || !data) throw new Error('User not found');
        return Boolean(data.must_change_password);
      },
      updateAuthPassword: async (id, newPassword) => {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password: newPassword });
        if (error) throw new Error('Failed to update authentication password.');
      },
      updateMustChangePassword: async (id) => {
        const { error } = await supabaseAdmin
          .from('users')
          .update({ must_change_password: false })
          .eq('id', id);

        if (error) {
          console.warn('Failed to update must_change_password after authentication password change.');
          throw new Error('Failed to update password change status.');
        }
      },
    });
  }

  static async forgotPassword(input: ForgotPasswordInput) {
    return forgotPasswordWithDependencies(input, {
      internalEmailDomain: ENV.INTERNAL_EMAIL_DOMAIN,
      passwordResetUrl: ENV.PASSWORD_RESET_URL,
      findPublicUserByEmail: async (email) => {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('id,email,full_name,is_active,must_change_password')
          .eq('email', email)
          .maybeSingle();

        if (error) throw new Error(error.message);
        return data as PublicUserSecurityState | null;
      },
      generateRecoveryTokenHash: async (email) => {
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
        });

        const tokenHash = (data?.properties as any)?.hashed_token;
        if (error || !tokenHash) throw new Error('Failed to generate password recovery token.');
        return tokenHash;
      },
      sendPasswordResetEmail: (emailInput) => EmailService.sendPasswordResetEmail(emailInput),
    });
  }

  static async resetPassword(input: ResetPasswordInput) {
    return resetPasswordWithDependencies(input, {
      verifyRecoveryToken: async (tokenHash) => {
        const { data, error } = await supabaseAuth.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        });

        if (error || !data.user) throw new Error('Invalid or expired password reset token.');
        return { userId: data.user.id };
      },
      getPublicUserById: async (userId) => {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('id,email,full_name,is_active,must_change_password')
          .eq('id', userId)
          .single();

        if (error || !data) return null;
        return data as PublicUserSecurityState;
      },
      updateAuthPassword: async (userId, newPassword) => {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

        if (error) throw new Error('Failed to update authentication password.');
      },
      updateMustChangePassword: async (userId) => {
        const { error } = await supabaseAdmin
          .from('users')
          .update({ must_change_password: false })
          .eq('id', userId);

        if (error) throw new Error(error.message);
      },
    });
  }

  static async getProfile(userId: string) {
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
    if (error || !data) throw new Error('User not found');
    return toProfile(data);
  }

  static async logout(accessToken: string) {
    if (accessToken) await supabaseAdmin.auth.admin.signOut(accessToken);
    return { success: true };
  }
}
