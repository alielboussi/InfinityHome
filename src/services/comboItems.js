import supabase from "../supabase";

const needsManualId = (error) => {
  if (!error || !error.message) return false;
  return /null value in column\s+"id"/i.test(error.message);
};

const fetchNextComboItemId = async () => {
  const { data, error } = await supabase
    .from("combo_items")
    .select("id")
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("Unable to compute next combo item id", error);
    return 1;
  }
  const latest = Array.isArray(data) && data.length ? Number(data[0].id) : 0;
  return Number.isFinite(latest) ? latest + 1 : 1;
};

export async function insertComboItems(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  let { error } = await supabase.from("combo_items").insert(rows);
  if (needsManualId(error)) {
    let nextId = await fetchNextComboItemId();
    const rowsWithIds = rows.map(row => ({ ...row, id: nextId++ }));
    ({ error } = await supabase.from("combo_items").insert(rowsWithIds));
  }

  if (error) {
    throw error;
  }
}
