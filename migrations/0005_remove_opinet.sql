-- The oil-price feature and its external credential are no longer used.
DELETE FROM integrations WHERE provider = 'opinet';
