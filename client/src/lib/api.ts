import axios from "axios";

import { API_URL } from "@/lib/config";

// Shared Axios instance for calling the Express API. `withCredentials` sends
// the Better Auth session cookie on cross-origin requests.
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});
