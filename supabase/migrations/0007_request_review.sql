-- "Bozza inviata": the designer has delivered a proof and waits for the client's approval.
alter type public.request_status add value if not exists 'review';
