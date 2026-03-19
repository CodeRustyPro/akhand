/**
 * Supabase client for Akhand frontend.
 *
 * Uses the publishable/anon key (safe for browser).
 * Direct table access is controlled by RLS policies.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dddtxzcpewnnblgaojpd.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

/**
 * Fetch books near a geographic point via Supabase RPC.
 * Falls back to the FastAPI endpoint if Supabase is not configured.
 */
export async function fetchNearbyBooks(lat: number, lng: number, radiusMeters = 50000) {
    if (!supabase) return null;

    const { data, error } = await supabase.rpc('books_near_point', {
        lng,
        lat,
        radius_meters: radiusMeters,
        max_results: 20,
    });

    if (error) {
        console.warn('Supabase nearby query failed:', error);
        return null;
    }

    // KNN fallback if too few results
    if (!data || data.length < 3) {
        const { data: fallback } = await supabase.rpc('books_nearest', {
            lng,
            lat,
            max_results: 10,
        });
        return { results: fallback || [], fallback: true };
    }

    return { results: data, fallback: false };
}

/**
 * Search places in Supabase via the fuzzy text search RPC.
 */
export async function searchPlaces(query: string, maxResults = 50) {
    if (!supabase) return null;

    const { data, error } = await supabase.rpc('search_places', {
        query,
        max_results: maxResults,
    });

    if (error) {
        console.warn('Supabase search failed:', error);
        return null;
    }

    return data;
}
