select
to_regclass('public.organizations') as organizations,
to_regclass('public.organization_members') as organization_members,
to_regclass('public.contracts') as contracts,
to_regclass('public.measurements') as measurements,
to_regclass('public.addenda') as addenda,
to_regclass('public.contract_documents') as contract_documents,
to_regclass('public.bids') as bids;
