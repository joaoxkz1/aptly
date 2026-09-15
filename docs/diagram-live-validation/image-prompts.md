# Synthetic photo fixtures

These photographs are generated fixtures, not authentic student work. The built-in ImageGen tool was used. Intended case labels and this document must stay outside assessment-provider inputs. Images require visual inspection before selecting them for a run; the prompt alone is not evidence of their contents.

## Messy but readable photo: generation prompt

Use case: scientific-educational

Asset type: synthetic photograph fixture for a classroom diagram-reading test

Primary request: Create one close-up natural photograph of a student's messy but readable blue-ballpoint-pen demand and supply diagram on plain slightly creased white notebook paper. Only the paper and a little desk edge are visible, no person.

Subject: wheat-market supply contraction, all in hurried uneven handwriting and freehand lines, with one small crossed-out stray pen mark in the unused margin. The diagram is economically and geometrically correct. It must look like a student's hurried drawing photographed with a phone, not a polished digital chart.

Composition: near overhead close-up, entire axes and all curve labels clearly inside frame. Ordinary indoor light, mild natural perspective, readable ink.

Exact diagram: A vertical axis on the left labeled "P"; a horizontal axis along the bottom labeled "Q". One downward-sloping demand line from upper-left to lower-right labeled "D" at its lower-right end. Two upward-sloping parallel supply lines: original "S1" on the right, new "S2" clearly to the LEFT of S1. Both cross the SAME unchanged D line. Mark the intersection of D and S1 as "E1" and the intersection of D and S2 as "E2". E2 is visibly ABOVE AND LEFT of E1, ON D. From E2, draw light dashed projections left to "P2" on the vertical axis and down to "Q2" on the horizontal axis. From E1 draw light dashed projections left to "P1" and down to "Q1". P2 is above P1; Q2 is left of Q1. Keep labels separate enough to read despite hurried lettering. Write a small "Wheat" above the drawing.

Constraints: Only these labels P, Q, D, S1, S2, E1, E2, P1, P2, Q1, Q2 and Wheat; no explanatory prose, instructions, teacher marks, ticks, crosses on the drawing, scores or intended marks. The lone margin cross-out is an accidental pen scribble, not a teacher marking. No watermark or printed typography. Preserve the correct intersections and projection positions while allowing wobbly pen lines and irregular letter sizes.

## Blurry-photo edit prompt

Use case: precise-object-edit

Asset type: second synthetic photograph fixture, derived from the provided photo

Input image 1 is the edit target. Preserve this exact notebook photograph, diagram positions, paper, desk edge, blue ink, and handwriting. Change only the photographic focus and camera-motion condition.

Make the WHOLE photograph severely out of focus with a small diagonal hand-shake smear, as an accidental close phone photograph taken before the lens focused. The axes and broad arrangement of three crossing curves may still be recognizable, but the essential small symbols and subscripts S1 versus S2, E1 versus E2, P1/P2 and Q1/Q2 must be impossible to distinguish reliably. The precise crossing locations and projection endpoints should be blurred enough to make their exact connections ambiguous. This must be substantially blurrier than a merely soft photo: use broad defocus that erases the small handwriting detail, not just a mild smoothing filter.

Do not change any economics, redraw lines, add markings, change the underlying text, crop out content, add teacher comments, marks, scores, descriptive text, watermark or visual instructions. Preserve the original image framing and lighting. The result should look like the same physical photo with a badly missed focus, not an illustration.

## Inspection record

- `images/wheat-messy-readable.png`: generated, copied into the repository, and visually inspected at native content scale. P/Q axes, one unchanged downward D, two upward supply curves, S2 left of S1, E2 above-left of E1, and the requested P/Q projections are all identifiable. Handwriting has irregular sizes and wobbly lines, with one margin scribble; the messiness is moderate rather than extreme. No teacher annotations, scores, or explanatory prose are visible. The small Wheat title is present. These are observations, not an awarded assessment mark.
- `images/wheat-blurry.png`: created by a built-in ImageGen edit of the readable file, copied into the repository, and visually inspected. The broad axes, curve slopes and two crossing regions remain recognizable. Severe defocus and smear make several subscripts and label-to-line details unreliable; fine projection connections are soft. This is a partially visible but materially ambiguous photo, not a blank page. A reviewer must judge whether the specific task's essential relationships can be established without inventing label identities. Do not treat the filename as a predetermined assessment outcome.

Both images were made with exactly two built-in ImageGen calls (one generation, one edit). Neither image was sent to an assessment model by this agent. Original generated files remain under the tool's default generated-images directory; the workspace copies are the fixtures used by the project.

## Severe-blur follow-up edit prompt

The root requested a separately saved, more degraded variant after inspecting the first blurry fixture. The edit target is `images/wheat-messy-readable.png`; the earlier fixtures remain unchanged.

Use case: precise-object-edit

Input image 1 is the exact edit target: the synthetic blue-pen wheat notebook photograph.

Create an EXTREMELY out-of-focus accidental phone photograph of that SAME page, with severe hand-shake. Preserve the underlying page, framing, lighting, desk edge, ink color and original diagram, changing only photographic degradation.

The desired degradation is much stronger than normal soft focus: broad overlapping blue-gray smears like approximately 70-pixel defocus combined with a 100-pixel diagonal motion trail at this image size. All labels, letters, numerals and subscripts must be unreadable. The central demand/supply crossing areas must merge into indistinct cloudy marks so an observer cannot reliably trace which supply curve meets which demand line or locate separate equilibrium points. Dashed projections should dissolve into faint cloudy traces. Avoid retaining crisp isolated dots or identifiable S1/S2/E1/E2 symbols. The overall impression of some blue handwritten chart on paper can remain, but the essential individual curve connections and their exact identities must be indeterminate.

This is a photographic blur edit, not a redesign. No added text, annotations, score, warning, teacher correction, explanation, caption or watermark. No new marks and no cropping. Do not sharpen any part of the drawing.

### Follow-up correction after visual inspection

The initial severe-blur candidate still retained separate crossing regions and traceable curves, despite destroying small text. It was not selected as the final severe fixture. A second targeted edit used this prompt:

Use case: precise-object-edit

Edit target: the provided synthetic notebook photograph. Change ONLY the photographic blur, preserving its framing, paper, desk and underlying ink.

The previous blur attempt still left clear crossing regions and traceable supply curves. Make this version MUCH more out of focus. Simulate approximately 180 to 250 pixels of broad lens defocus across the entire 1300-pixel-wide image, with no locally sharp ink anywhere. The blue ink must spread into large diffuse translucent blue-gray clouds. Individual lines must NOT remain independently traceable, separate equilibrium points must NOT remain locatable, and all words, letters, numbers and subscripts must be completely illegible. The central graph should be only merged amorphous blue-gray haze on paper, not a recognizable set of separate curves. A viewer should be unable to reconstruct the economics from this image alone. A vague impression of a blurry student page with blue marks and the same desk edge is sufficient.

This is a deliberately unusable camera-focus failure. Do not redraw or add any text, warnings, annotations, scores, objects or symbols. Do not sharpen the paper or ink; apply the severe lens defocus to the whole photograph.

Final inspection: `images/wheat-severe-blur.png` contains diffuse ink clouds on the same page. Text and subscripts cannot be read reliably, separate equilibrium dots are no longer sharply locatable, and precise curve/projection connections cannot be traced with confidence. Some broad axis-like and diagonal haze remains, but a supply contraction and its initial/final labels cannot be established from those remnants alone. The final file was copied into the repository and viewed at original detail. This follow-up required two built-in ImageGen edits, the first rejected after inspection; total fixture creation across all three selected images used four ImageGen calls. This agent made zero assessment calls.
