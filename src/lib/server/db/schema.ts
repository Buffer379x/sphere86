import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
	mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(true),
	createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: text('expires_at').notNull(),
	createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const streamingHosts = sqliteTable('streaming_hosts', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	/** True when Sphere86 owns lifecycle (embedded local streaming host). */
	managed: integer('managed', { mode: 'boolean' }).notNull().default(false),
	/** Reserved values: '', 'embedded'. */
	managedKind: text('managed_kind').notNull().default(''),
	address: text('address').notNull(),
	port: integer('port').notNull().default(47990),
	username: text('username').notNull().default(''),
	/** Encrypted with SPHERE86_SECRET */
	credentialEncrypted: text('credential_encrypted').notNull().default(''),
	tlsVerify: integer('tls_verify', { mode: 'boolean' }).notNull().default(false),
	/** API/Web UI: auto = try HTTPS then HTTP */
	sunshineScheme: text('sunshine_scheme').notNull().default('auto'),
	configBasePath: text('config_base_path').notNull().default('/data/86box'),
	binaryPath: text('binary_path').notNull().default('/usr/local/bin/86Box'),
	/** X11 display for 86Box + must match Sunshine (e.g. :0 or :2.0 from `echo $DISPLAY` on the host). */
	x11Display: text('x11_display').notNull().default(':0'),
	/** Append 86Box `-F` when publishing / re-publishing to Sunshine. */
	box86StartFullscreen: integer('box86_start_fullscreen', { mode: 'boolean' }).notNull().default(true),
	status: text('status', { enum: ['online', 'offline', 'unknown'] }).notNull().default('unknown'),
	sunshineVersion: text('sunshine_version'),
	lastCheckedAt: text('last_checked_at'),
	createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const machineProfiles = sqliteTable('machine_profiles', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description').notNull().default(''),
	hostId: text('host_id').notNull().references(() => streamingHosts.id, { onDelete: 'cascade' }),
	/** Full 86box.cfg content */
	configContent: text('config_content').notNull(),
	/** JSON of structured form data for re-editing */
	configMeta: text('config_meta').notNull().default('{}'),
	/** Relative path under host's configBasePath */
	deployPath: text('deploy_path').notNull(),
	deployed: integer('deployed', { mode: 'boolean' }).notNull().default(false),
	sunshineAppId: text('sunshine_app_id'),
	createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const sunshineAppLinks = sqliteTable('sunshine_app_links', {
	id: text('id').primaryKey(),
	profileId: text('profile_id').notNull().references(() => machineProfiles.id, { onDelete: 'cascade' }),
	hostId: text('host_id').notNull().references(() => streamingHosts.id, { onDelete: 'cascade' }),
	sunshineAppName: text('sunshine_app_name').notNull(),
	sunshineAppIndex: integer('sunshine_app_index'),
	command: text('command').notNull(),
	createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const jobs = sqliteTable('jobs', {
	id: text('id').primaryKey(),
	type: text('type').notNull(),
	status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).notNull().default('pending'),
	progress: real('progress').notNull().default(0),
	message: text('message').notNull().default(''),
	result: text('result'),
	createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const auditLog = sqliteTable('audit_log', {
	id: text('id').primaryKey(),
	userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
	action: text('action').notNull(),
	entityType: text('entity_type').notNull(),
	entityId: text('entity_id'),
	details: text('details'),
	createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});
