"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGlobalSearchRequest, type SearchResults } from "../api/search.api";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

const EMPTY_RESULTS: SearchResults = {
  customers: [],
  vehicles: [],
  jobCards: [],
  spareParts: [],
  users: [],
};

export function useGlobalSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const enabled = debouncedQuery.trim().length >= MIN_QUERY_LENGTH;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => getGlobalSearchRequest(debouncedQuery),
    enabled,
    staleTime: 30_000,
  });

  const hasResults = enabled && data
    ? Object.values(data).some((arr) => arr.length > 0)
    : false;

  return {
    results: data ?? EMPTY_RESULTS,
    isLoading: enabled && isLoading,
    isFetching: enabled && isFetching,
    hasResults,
    enabled,
  };
}
