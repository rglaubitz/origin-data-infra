/**
 * Supabase Edge Function: sync-to-sheets
 * Syncs computed fields from Supabase back to Google Sheets
 *
 * Triggered by pg_cron every 2 minutes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Google Sheets API endpoint
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

interface DirtyRow {
  id: string;
  sheets_row_id: number;
  status: string;
  qb_account: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Google credentials from Vault or env
    const googleCreds = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");

    if (!googleCreds || !sheetId) {
      throw new Error("Missing Google credentials or Sheet ID");
    }

    const serviceAccount = JSON.parse(googleCreds);

    // Get access token for Google Sheets API
    const accessToken = await getGoogleAccessToken(serviceAccount);

    // Find dirty rows (sheets_synced_at IS NULL)
    const { data: dirtyTransactions, error: txnError } = await supabase
      .from("transactions")
      .select("id, sheets_row_id, status, qb_account")
      .is("sheets_synced_at", null)
      .not("sheets_row_id", "is", null)
      .limit(100);

    if (txnError) throw txnError;

    let syncedCount = 0;

    // Batch update Sheets
    if (dirtyTransactions && dirtyTransactions.length > 0) {
      const updates = dirtyTransactions.map((row: DirtyRow) => ({
        range: `'All Transactions'!A${row.sheets_row_id}:F${row.sheets_row_id}`,
        values: [[row.status, null, null, null, null, row.qb_account]],
      }));

      // Use batchUpdate for efficiency
      const batchResponse = await fetch(
        `${SHEETS_API_BASE}/${sheetId}/values:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            valueInputOption: "RAW",
            data: updates.map((u) => ({
              range: u.range,
              values: u.values,
            })),
          }),
        },
      );

      if (!batchResponse.ok) {
        const errorText = await batchResponse.text();
        console.error("Sheets API error:", errorText);
      } else {
        // Mark as synced in Supabase
        const ids = dirtyTransactions.map((r: DirtyRow) => r.id);
        await supabase
          .from("transactions")
          .update({ sheets_synced_at: new Date().toISOString() })
          .in("id", ids);

        syncedCount = dirtyTransactions.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Get Google OAuth access token using service account
 */
async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Create JWT header and payload
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  // Sign JWT
  const jwt = await createSignedJwt(
    header,
    payload,
    serviceAccount.private_key,
  );

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Create signed JWT for Google OAuth
 */
async function createSignedJwt(
  header: object,
  payload: object,
  privateKeyPem: string,
): Promise<string> {
  // Base64url encode header and payload
  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Import private key
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Sign
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signatureInput),
  );

  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${signatureInput}.${encodedSignature}`;
}
