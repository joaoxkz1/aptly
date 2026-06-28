import type { Attempt } from "./types";
import { daysAgoIso } from "./utils";

/**
 * Eight handcrafted demo attempts so the dashboard feels alive on first load.
 * Dates are generated relative to "today" so the streak and weekly stats
 * always look current. Designed so that:
 *  - Market Failure is the weakest topic (repeated evaluation mistakes)
 *  - Elasticities is the most improved (3 → 6)
 *  - The current streak is 4 days
 */
export function buildSeedAttempts(): Attempt[] {
  return [
    {
      id: "seed-1",
      createdAt: daysAgoIso(12, 16),
      subject: "Economics",
      topic: "Elasticities",
      question:
        "Explain why the price elasticity of demand for petrol differs in the short run and the long run.",
      answer:
        "Petrol demand is inelastic because people need it for cars. If the price goes up people still buy it. Over time they might buy less.",
      feedback: {
        score: 3,
        band: "Limited 3",
        strengths: ["You engage directly with the question and stay on topic throughout."],
        improvements: [
          "Define PED precisely and use the formula to frame the answer.",
          "Anchor the theory in a specific real-world case (a country, firm, or dataset).",
        ],
        mistakes: ["Weak definitions", "No real-world example"],
        examinerComment:
          "A limited response on Elasticities — knowledge is present but underdeveloped. The response explains but does not evaluate — the command term demands a supported judgement. Rework this answer using the markscheme structure, then attempt a similar question unseen.",
        studyNext: "Revisit Elasticities: drill the key definitions before your next attempt.",
      },
    },
    {
      id: "seed-2",
      createdAt: daysAgoIso(10, 18),
      subject: "Physics",
      topic: "Mechanics",
      question:
        "A 2.0 kg trolley accelerates from rest to 6.0 m/s in 3.0 s. Calculate the resultant force acting on it.",
      answer:
        "The trolley speeds up so there must be a force. Using F = ma, the acceleration is 2 so the force is about 4 N.",
      feedback: {
        score: 5,
        band: "Secure 5",
        strengths: [
          "The governing equation F = ma is identified correctly.",
          "The final value is consistent with the chosen acceleration.",
        ],
        improvements: [
          "Show the substitution step explicitly with units (a = Δv/t = 6.0/3.0 = 2.0 m/s²).",
          "State units at every stage — bare numbers lose marks.",
        ],
        mistakes: ["Calculation/setup error"],
        examinerComment:
          "A secure response on Mechanics, though the top band remains out of reach. The setup is implied rather than shown — state equations before substituting. Rework this answer using the markscheme structure, then attempt a similar question unseen.",
        studyNext:
          "Revisit Mechanics: rework the standard calculation setups before your next attempt.",
      },
    },
    {
      id: "seed-3",
      createdAt: daysAgoIso(8, 17),
      subject: "Economics",
      topic: "Market Failure",
      question:
        "Discuss whether indirect taxation is the best way to correct the market failure caused by cigarette consumption.",
      answer:
        "Cigarettes create negative externalities of consumption, meaning the social cost is higher than the private cost. An indirect tax shifts supply left and raises the price, reducing the quantity consumed towards the social optimum. This internalises the externality.",
      feedback: {
        score: 4,
        band: "Developing 4",
        strengths: [
          "Key terms are defined explicitly, which secures the AO1 knowledge marks.",
          "The mechanism of the tax is explained accurately.",
        ],
        improvements: [
          "The command term is 'discuss' — weigh the tax against alternatives (regulation, education) and consider inelastic demand.",
          "Refer to a labelled externalities diagram and explain the welfare loss triangle.",
        ],
        mistakes: ["Lack of evaluation", "Missing diagram explanation"],
        examinerComment:
          "A developing response on Market Failure that shows understanding but limited depth. The response explains but does not evaluate — the command term demands a supported judgement. Rework this answer using the markscheme structure, then attempt a similar question unseen.",
        studyNext:
          "Revisit Market Failure: practise writing two-sided evaluations before your next attempt.",
      },
    },
    {
      id: "seed-4",
      createdAt: daysAgoIso(6, 19),
      subject: "Business",
      topic: "Motivation Theories",
      question:
        "Explain how Herzberg's two-factor theory could help a manager reduce staff turnover.",
      answer:
        "Herzberg distinguishes hygiene factors, which prevent dissatisfaction, from motivators, which create satisfaction. A manager should first fix hygiene factors such as pay and conditions, because however good the motivators are, poor hygiene factors cause people to leave. Then they should build in motivators like recognition and responsibility. However, the theory depends on the workforce — for routine jobs, hygiene factors may matter more.",
      feedback: {
        score: 6,
        band: "Strong 6",
        strengths: [
          "Key terms are defined explicitly, which secures the AO1 knowledge marks.",
          "There is genuine evaluation — you weigh the argument rather than just asserting it.",
        ],
        improvements: [
          "Anchor the theory in a specific real-world firm to lift this into the top band.",
        ],
        mistakes: ["No real-world example"],
        examinerComment:
          "A strong response on Motivation Theories with clear analytical development. The evaluation engages with the command term, which is exactly what the top band requires. To consolidate, practise under timed conditions and tighten the conclusion.",
        studyNext:
          "Revisit Motivation Theories: collect two real-world case studies before your next attempt.",
      },
    },
    {
      id: "seed-5",
      createdAt: daysAgoIso(4, 16),
      subject: "Economics",
      topic: "Market Failure",
      question:
        "Evaluate the view that government provision is the most effective response to public goods market failure.",
      answer:
        "Public goods are non-rivalrous and non-excludable so the free market fails to provide them because of the free rider problem. The government can provide them using tax revenue. Street lighting is an example. So government provision solves the failure.",
      feedback: {
        score: 3,
        band: "Limited 3",
        strengths: [
          "Key terms are defined explicitly, which secures the AO1 knowledge marks.",
          "A real-world example is used to support the analysis, which examiners reward.",
        ],
        improvements: [
          "The command term 'evaluate' requires counter-arguments: government failure, opportunity cost, contracting out.",
          "Structure the answer into clear paragraphs with a final supported judgement.",
        ],
        mistakes: ["Lack of evaluation", "Unclear structure"],
        examinerComment:
          "A limited response on Market Failure — knowledge is present but underdeveloped. The response explains but does not evaluate — the command term demands a supported judgement. Rework this answer using the markscheme structure, then attempt a similar question unseen.",
        studyNext:
          "Revisit Market Failure: practise writing two-sided evaluations before your next attempt.",
      },
    },
    {
      id: "seed-6",
      createdAt: daysAgoIso(2, 20),
      subject: "Physics",
      topic: "Waves",
      question:
        "Describe how the diffraction pattern of light through a single slit changes as the slit width decreases.",
      answer:
        "As the slit width decreases, the central maximum becomes wider because the angle of the first minimum is given by sin θ = λ/b, so a smaller b gives a larger θ. The intensity of the pattern also decreases because less light passes through. For example, with a 0.1 mm slit and red laser light the central band visibly broadens.",
      feedback: {
        score: 6,
        band: "Strong 6",
        strengths: [
          "Working is shown with values and units, making the method easy to credit.",
          "A real-world example is used to support the analysis, which examiners reward.",
        ],
        improvements: [
          "Sketch and annotate the intensity distribution — the diagram carries marks here.",
        ],
        mistakes: ["Missing diagram explanation"],
        examinerComment:
          "A strong response on Waves with clear analytical development. The method is shown clearly; keep stating equations before substituting. To consolidate, practise under timed conditions and tighten the conclusion.",
        studyNext:
          "Revisit Waves: redraw and annotate the core diagrams before your next attempt.",
      },
    },
    {
      id: "seed-7",
      createdAt: daysAgoIso(3, 18),
      subject: "Economics",
      topic: "Market Failure",
      question:
        "Using a diagram, explain why a carbon tax may fail to reduce emissions to the socially optimal level.",
      answer:
        "A carbon tax shifts the supply curve left, raising price and lowering output towards the social optimum shown on the diagram where MSC = MSB. But the government may not know the exact size of the external cost, so the tax could be set too low. Demand for energy is also price inelastic, so the fall in quantity is small.",
      feedback: {
        score: 4,
        band: "Developing 4",
        strengths: [
          "You reference a diagram/model and connect it to the written argument.",
          "Information problems are identified as a cause of policy failure.",
        ],
        improvements: [
          "Develop the evaluation into a judgement: under what conditions would the tax work?",
          "Add a real-world case (e.g. a country with a carbon tax) to ground the analysis.",
        ],
        mistakes: ["Lack of evaluation", "No real-world example"],
        examinerComment:
          "A developing response on Market Failure that shows understanding but limited depth. The analysis is accurate but stops short of a supported judgement. Rework this answer using the markscheme structure, then attempt a similar question unseen.",
        studyNext:
          "Revisit Market Failure: practise writing two-sided evaluations before your next attempt.",
      },
    },
    {
      id: "seed-8",
      createdAt: daysAgoIso(1, 17),
      subject: "Economics",
      topic: "Elasticities",
      question:
        "Discuss the usefulness of price elasticity of demand to a firm deciding its pricing strategy.",
      answer:
        "PED is defined as the responsiveness of quantity demanded to a change in price. If demand is price inelastic, a firm can raise price and increase revenue; if elastic, it should consider cutting price. For example, rail operators raise peak fares because commuter demand is inelastic. However, PED estimates depend on past data and may be unreliable when markets change, and firms must also consider competitors and brand image. Overall PED is a useful starting point but not sufficient on its own.",
      feedback: {
        score: 6,
        band: "Strong 6",
        strengths: [
          "Key terms are defined explicitly, which secures the AO1 knowledge marks.",
          "There is genuine evaluation — you weigh the argument rather than just asserting it.",
          "A real-world example is used to support the analysis, which examiners reward.",
        ],
        improvements: [
          "Quantify the example (an actual PED estimate) and link revenue changes to a diagram for the top band.",
        ],
        mistakes: ["Missing diagram explanation"],
        examinerComment:
          "A strong response on Elasticities with clear analytical development. The evaluation engages with the command term, which is exactly what the top band requires. To consolidate, practise under timed conditions and tighten the conclusion.",
        studyNext:
          "Revisit Elasticities: redraw and annotate the core diagrams before your next attempt.",
      },
    },
  ];
}
