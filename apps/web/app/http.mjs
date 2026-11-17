/** Bound API waits, including response bodies, so outages never leave the UI stuck. */
export async function fetchJson(url, options = {}, timeoutMs = 20000) {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), timeoutMs);
 try {
  const response = await fetch(url, {...options, signal: controller.signal});
  let result;
  try { result = await response.json(); }
  catch (error) {
   if (controller.signal.aborted) throw error;
   throw Object.assign(new Error('The server is temporarily unavailable. Please try again shortly.'), {status: response.status});
  }
  if (!response.ok) throw Object.assign(new Error(result?.message || 'Unable to complete this action.'), {status: response.status});
  return result;
 } catch (error) {
  if (controller.signal.aborted) throw new Error('The server took too long to respond. Please try again shortly.');
  if (error instanceof TypeError) throw new Error('Unable to reach Secret Santa. Please try again shortly.');
  throw error;
 } finally { clearTimeout(timer); }
}
