// Synthetic S1, S2 fiscal transfer and S3 City B shapes from the Sept 5 audit.
// Only local test code imports these; no real student data or remote writes.
import { focusAttempt } from './focused-practice-fixtures';
import type { Attempt } from '@/lib/types';
const shapes = [
  {
    "question": "Define opportunity cost. [2 marks]",
    "answer": "Opportunity cost is the money you spend and all the other things you give up when you choose to buy something.",
    "feedback": {
      "band": "Developing 4",
      "score": 4,
      "mistakes": [
        "Weak definitions"
      ],
      "strengths": [
        "Recognises that making a choice involves giving up alternatives."
      ],
      "studyNext": "Learn the precise distinction: price is the money paid; opportunity cost is the value of the next best option sacrificed. Practise defining it in one sentence.",
      "improvements": [
        "State that opportunity cost is specifically the value of the next best alternative forgone, rather than the money spent or all alternatives given up."
      ],
      "examinerComment": "Estimated practice mark: 1/2. You identify the idea of sacrifice in choice, but opportunity cost is not the monetary price and is not all forgone options. It is the next best alternative forgone."
    },
    "assessment": {
      "framework": "paper2_short_analytic",
      "syllabusTopic": "1.1",
      "marksAvailable": 2,
      "marksAssessable": 2,
      "marksEarned": 1,
      "assessmentSkills": [
        "definition"
      ],
      "markBreakdown": [
        {
          "label": "Knowledge and terminology",
          "reason": "The response captures that choices entail forgone alternatives, but incorrectly includes money spent and does not identify the next best alternative.",
          "awarded": 2,
          "available": 4
        }
      ]
    }
  },
  {
    "question": "Explain how an increase in government spending on public transport may reduce cyclical unemployment when an economy has spare capacity. [10 marks]",
    "answer": "Government spending is part of aggregate demand, so increased spending on public transport raises AD. For example, the government might pay firms to improve bus services. Those firms receive more demand for their services and may need to increase their output.\n\nIf they need additional workers to provide the extra services, they will recruit people. This can reduce cyclical unemployment, which happens because demand in the economy is too low. The extra government spending helps replace some of that missing demand.\n\nSpare capacity means the economy has workers and resources that are not fully used. Firms can therefore expand production using these resources, instead of the extra spending mainly causing higher prices. The spending reduces unemployment when it actually increases production and the demand for labour. It may take time for the transport work and recruitment to begin.",
    "feedback": {
      "band": "Strong 6",
      "score": 6,
      "mistakes": [
        "Underdeveloped economic analysis"
      ],
      "strengths": [
        "Clearly identifies government spending as a component of aggregate demand (AD) and explains the initial rise in demand for public-transport firms.",
        "Accurately links spare capacity to the ability of firms to raise real output and employment rather than mainly raising the price level.",
        "Directly connects increased labour demand and recruitment to a reduction in cyclical, demand-deficient unemployment."
      ],
      "studyNext": "Practise explaining fiscal policy using a complete AD → real output → derived demand for labour → unemployment chain, including when the multiplier is likely to be strongest.",
      "improvements": [
        "Develop the AD mechanism further: higher incomes for newly employed workers can generate induced consumption, creating a multiplier effect and further demand for labour.",
        "Make the macroeconomic chain more explicit, for example: government spending rises → AD rises → real output rises while spare capacity exists → derived demand for labour rises → cyclical unemployment falls.",
        "A brief AD–AS diagram showing an outward AD shift in the Keynesian/spare-capacity range could support the explanation, although it was not required by the question."
      ],
      "examinerComment": "Estimated practice mark: 8/10. This is a focused and accurate explanation that addresses the significance of spare capacity well. The answer clearly explains how public-transport spending increases AD, output and firms’ demand for workers, thereby reducing cyclical unemployment. To reach the highest band, develop the full macroeconomic transmission mechanism further, especially possible multiplier effects and the resulting wider increase in employment beyond the transport sector."
    },
    "assessment": {
      "framework": "paper1a_10_mark",
      "syllabusTopic": "3.6",
      "marksAvailable": 10,
      "marksAssessable": 10,
      "marksEarned": 8,
      "assessmentSkills": [
        "economic_analysis",
        "application"
      ],
      "markBreakdown": [
        {
          "label": "Knowledge and terminology",
          "reason": "Uses AD, spare capacity and cyclical unemployment accurately and relevantly.",
          "awarded": 3,
          "available": 4
        },
        {
          "label": "Economic analysis",
          "reason": "Explains the direct spending-to-output-to-employment mechanism coherently, but does not develop wider multiplier or economy-wide effects.",
          "awarded": 3,
          "available": 4
        },
        {
          "label": "Application to context",
          "reason": "Applies the explanation specifically to public-transport firms, service provision and recruitment.",
          "awarded": 3,
          "available": 4
        },
        {
          "label": "Structure and clarity",
          "reason": "The response is concise, logically sequenced and consistently focused on the question.",
          "awarded": 4,
          "available": 4
        }
      ]
    }
  },
  {
    "question": "In City B, most commuters have frequent affordable buses, but commercial delivery vans have few alternatives. Discuss whether a congestion charge is preferable to a blanket ban on vehicle entry for reducing congestion and associated pollution. [15 marks]",
    "answer": "A congestion charge makes driving into City B more expensive, whereas a blanket ban stops vehicles entering. Both could reduce congestion and pollution, but they would affect different users differently.\n\nMost commuters have frequent affordable buses. If they have to pay a congestion charge, they may decide that taking the bus is cheaper. Because buses are frequent, this is also a practical choice. Fewer commuters driving would reduce the number of vehicles on the roads and could reduce pollution.\n\nHowever, delivery vans have few alternatives. They may keep entering and pay the charge because they still need to deliver goods. Businesses might then increase their prices to cover the extra cost. The charge would therefore probably change commuters’ behaviour more than delivery drivers’ behaviour.\n\nA blanket ban would stop more vehicles entering, including vans that would otherwise pay the charge. However, it could make deliveries difficult and disrupt businesses. Commuters would find it easier to manage because they could use the buses.\n\nOverall, I think the congestion charge is preferable because it encourages commuters to switch while allowing deliveries to continue. It may not remove all congestion, and the charge would need to be high enough to influence commuters.",
    "feedback": {
      "band": "Secure 5",
      "score": 5,
      "mistakes": [
        "Underdeveloped evaluation"
      ],
      "strengths": [
        "Applies the City B context effectively: frequent, affordable buses make commuters more likely to switch, while delivery vans have limited substitutes.",
        "Clearly distinguishes the two policies and explains relevant consequences for congestion, pollution, deliveries and business costs.",
        "Reaches a clear, context-based judgement in favour of the congestion charge rather than simply listing advantages and disadvantages."
      ],
      "studyNext": "Practise extending a policy judgement through conditions and trade-offs: state when the congestion charge would work best, when a ban could be justified, and whether a combined policy would outperform either policy alone.",
      "improvements": [
        "Develop the evaluation further by considering how the size of the charge, demand responsiveness, exemptions for essential vans, enforcement costs and possible delivery-time restrictions would affect the preferred policy.",
        "Explain the pollution mechanism more fully: reduced private-car trips lower emissions, but vans continuing to enter means the pollution reduction may be limited.",
        "Qualify the conclusion more explicitly: a ban might be preferable in a severely congested central area if deliveries can be shifted to consolidation hubs, off-peak hours or cleaner alternative vehicles."
      ],
      "examinerComment": "Estimated practice mark: 11/15. This is a focused and well-applied response with sound analysis of why a charge is likely to alter commuter behaviour more than van use in City B. The comparison with a ban is clear and the final judgement is supported. To move into the highest band, deepen the weighing of effectiveness and practical design: for example, whether the charge is sufficiently high, how sensitive commuters are to price, whether vans receive exemptions, and whether complementary delivery arrangements could make a ban more feasible."
    },
    "assessment": {
      "framework": "paper1b_15_mark",
      "syllabusTopic": "2.8",
      "marksAvailable": 15,
      "marksAssessable": 15,
      "marksEarned": 11,
      "assessmentSkills": [
        "economic_analysis",
        "application",
        "evaluation"
      ],
      "markBreakdown": [
        {
          "label": "Knowledge and terminology",
          "reason": "Accurately distinguishes a congestion charge from a blanket vehicle-entry ban and uses relevant ideas about alternatives and behavioural responses.",
          "awarded": 3,
          "available": 4
        },
        {
          "label": "Economic analysis",
          "reason": "Explains a logical chain from higher driving costs to commuter switching, fewer vehicles and lower pollution, and identifies business cost pass-through from van charges.",
          "awarded": 3,
          "available": 4
        },
        {
          "label": "Application to context",
          "reason": "The frequent affordable buses and lack of alternatives for delivery vans are consistently integrated into the analysis and conclusion.",
          "awarded": 4,
          "available": 4
        },
        {
          "label": "Evaluation and judgment",
          "reason": "Compares the policies' trade-offs and gives a supported preference, but evaluation of policy design, effectiveness conditions and alternatives remains limited.",
          "awarded": 3,
          "available": 4
        },
        {
          "label": "Structure and clarity",
          "reason": "The response is concise, coherent and organised around comparison before reaching a direct judgement.",
          "awarded": 4,
          "available": 4
        }
      ]
    }
  }
] as const;

export function learningLoopAttempt(scenario: 'knowledge' | 'analysis' | 'evaluation'): Attempt {
  const shape = structuredClone(shapes[['knowledge','analysis','evaluation'].indexOf(scenario)]);
  const base = focusAttempt();
  return { ...base, ...shape, practiceQuestionId: null, parentAttemptId: null,
    assessment: { ...base.assessment!, ...shape.assessment } } as unknown as Attempt;
}
