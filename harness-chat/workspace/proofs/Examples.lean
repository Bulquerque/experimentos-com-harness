theorem identity_example (p : Prop) (h : p) : p := by
  exact h

theorem zero_add_example (n : Nat) : 0 + n = n := by
  rfl
