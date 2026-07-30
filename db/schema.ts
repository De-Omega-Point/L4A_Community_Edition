import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const communityRegistrations = sqliteTable(
  "community_registrations",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    businessName: text("business_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    businessType: text("business_type"),
    edition: text("edition").notNull().default("community"),
    termsAccepted: integer("terms_accepted", { mode: "boolean" }).notNull(),
    termsVersion: text("terms_version").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    feedbackConsent: integer("feedback_consent", { mode: "boolean" }).notNull().default(false),
    registeredAt: text("registered_at").notNull(),
    surveyDueAt: text("survey_due_at"),
    surveyStatus: text("survey_status").notNull().default("not_due"),
    welcomeStatus: text("welcome_status").notNull().default("pending"),
    upgradeInterest: text("upgrade_interest"),
    upgradeInterestAt: text("upgrade_interest_at"),
  },
  (table) => [
    uniqueIndex("community_registrations_product_id_unique").on(table.productId),
  ],
);
