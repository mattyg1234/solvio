/** Stable database rejection codes translated for the partner booking form. */
export function partnerBookingErrorMessage(error: { message: string }): string {
  switch (error.message) {
    case "SHOW_OPS_SHOW_FULL":
      return "There are not enough tickets left for this party. Choose another night or ring the office.";
    case "SHOW_OPS_BUS_FULL":
      return "There are not enough bus seats left for this party. Ring the office to arrange transport or choose another night.";
    case "SHOW_OPS_NIGHT_CLOSED":
      return "This night is closed for bookings. Choose another night or ring the office.";
    case "SHOW_OPS_PRODUCT_UNAVAILABLE":
      return "This show is no longer available. Refresh the page and choose another show.";
    default:
      return "We could not save this booking. Refresh the page and try again, or ring the office.";
  }
}
