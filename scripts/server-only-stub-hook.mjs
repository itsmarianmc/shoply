
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
      format: "module",
    };
  }
  return next(specifier, context);
}
