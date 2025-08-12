// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create an admin client using the Service Role Key (bypasses RLS inside this function)
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://rhubaybwftyypfbiuoyc.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function ensureIsAdmin(authHeader?: string | null) {
  if (!authHeader) {
    return { ok: false, status: 401, msg: 'Missing Authorization header' } as const;
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { ok: false, status: 401, msg: 'Invalid token' } as const;
  }
  const userId = authData.user.id;
  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !profile || profile.role !== 'admin') {
    return { ok: false, status: 403, msg: 'Forbidden: admin only' } as const;
  }
  return { ok: true, userId } as const;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify caller is admin
  const check = await ensureIsAdmin(req.headers.get('Authorization'));
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.msg }), {
      status: check.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === 'create_user') {
      const { email, password, role, display_name } = body as {
        email: string; password: string; role: string; display_name?: string;
      };
      if (!email || !password || !role) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 1) Create or reuse existing auth user (idempotent by email)
      const normalizedEmail = (email || '').trim().toLowerCase();
      let user_id: string | null = null;

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { display_name, role },
      });

      if (createErr || !created?.user) {
        // If email already exists, find existing user by email and continue
        const message = createErr?.message?.toLowerCase() || '';
        if (message.includes('already') || message.includes('exists') || message.includes('registered')) {
          const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (listErr) {
            return new Response(JSON.stringify({ error: listErr.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          const existing = list.users.find((u) => (u.email || '').toLowerCase() === normalizedEmail);
          if (!existing) {
            return new Response(JSON.stringify({ error: 'Email already registered, but user lookup failed' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          user_id = existing.id;
        } else {
          return new Response(JSON.stringify({ error: createErr?.message || 'Create user failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        user_id = created.user.id;
      }

      // 2) Upsert profile
      const { error: profileErr } = await adminClient
        .from('profiles')
        .upsert({ user_id, display_name: display_name || normalizedEmail, role }, { onConflict: 'user_id' });
      if (profileErr) {
        return new Response(JSON.stringify({ error: profileErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true, user_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_role') {
      const { user_id, role } = body as { user_id: string; role: string };
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { error } = await adminClient
        .from('profiles')
        .update({ role })
        .eq('user_id', user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete_user') {
      const { user_id } = body as { user_id: string };
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'Missing user_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Optionally remove profile
      await adminClient.from('profiles').delete().eq('user_id', user_id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_users') {
      // Auth users (email) + profiles (role/display_name)
      const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 100 });
      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const ids = list.users.map((u) => u.id);
      const { data: profiles, error: profErr } = await adminClient
        .from('profiles')
        .select('user_id, display_name, role, created_at, updated_at')
        .in('user_id', ids);
      if (profErr) {
        return new Response(JSON.stringify({ error: profErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const merged = list.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        profile: profiles?.find((p: any) => p.user_id === u.id) || null,
      }));
      return new Response(JSON.stringify({ users: merged }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
