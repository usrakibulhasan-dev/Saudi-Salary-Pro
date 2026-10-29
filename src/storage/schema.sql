-- ============================================================================
-- SAUDI SALARY PRO — CLOUD DATABASE SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- Target: PostgreSQL / Supabase (for Cloud Mode & Multi-Device Sync)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. WORKSPACES (Tenants)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USER PROFILES & ROLES
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner_admin', 'hr_payroll_manager', 'supervisor_readonly', 'employee_self_service')),
  linked_employee_id UUID,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. EMPLOYEE PROFILES
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  nationality TEXT,
  job_title TEXT,
  department TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('fixed_term', 'indefinite')),
  basic_salary NUMERIC(12, 2) NOT NULL CHECK (basic_salary >= 0),
  housing_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  food_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transport_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  other_fixed_allowances NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_leave_entitlement INTEGER NOT NULL DEFAULT 21,
  working_days_per_month INTEGER NOT NULL DEFAULT 30,
  working_hours_per_day NUMERIC(4, 2) NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, employee_code)
);

-- 4. PAYROLL PERIODS
CREATE TABLE payroll_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- Format YYYY-MM
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'under_review', 'approved', 'paid')),
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  total_gross NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_overtime NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, month_year)
);

-- 5. AUDIT LOGS
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) ENFORCEMENT
-- ============================================================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read employees in their own workspace; self-service employees can only read their own record
CREATE POLICY "Tenant and Role Isolation for Employees Select"
  ON employees FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_profiles WHERE id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role IN ('owner_admin', 'hr_payroll_manager', 'supervisor_readonly')
      )
      OR id = (SELECT linked_employee_id FROM user_profiles WHERE id = auth.uid())
    )
  );

-- Policy: Only Owner/Admin and HR/Payroll Manager can insert or update employees in their workspace
CREATE POLICY "Role-Based Employee Write"
  ON employees FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('owner_admin', 'hr_payroll_manager')
    )
  );
