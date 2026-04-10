import type { Config } from 'drizzle-kit'

export default {
  schema: './src/main/lib/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: `${process.env.HOME}/Library/Application Support/Briefly/briefly.db`,
  },
} satisfies Config
