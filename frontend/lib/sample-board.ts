import type { GameBoard } from "@jeoparty/shared";

export function makeSampleBoard(): GameBoard {
  const mkQ = (i: number, v: number, prompt: string, answer: string) => ({
    id: `q-${i}-${v}-${Math.random().toString(36).slice(2, 8)}`,
    prompt,
    answer,
    value: v,
  });
  return {
    id: `board-${Math.random().toString(36).slice(2, 8)}`,
    title: "Party Pack #1",
    categories: [
      {
        id: `c-${Math.random().toString(36).slice(2, 8)}`,
        title: "World Capitals",
        questions: [
          mkQ(1, 200, "This capital city sits on the Seine.", "What is Paris?"),
          mkQ(1, 400, "Japan's capital; it means 'eastern capital'.", "What is Tokyo?"),
          mkQ(1, 600, "Since 1960 this city has been Brazil's capital.", "What is Brasília?"),
          mkQ(1, 800, "Landlocked capital of Mongolia.", "What is Ulaanbaatar?"),
          mkQ(1, 1000, "Capital of the country with the longest name in Oceania.", "What is Port Moresby?"),
        ],
      },
      {
        id: `c-${Math.random().toString(36).slice(2, 8)}`,
        title: "Classic Movies",
        questions: [
          mkQ(2, 200, "'Here's looking at you, kid.' — this 1942 film.", "What is Casablanca?"),
          mkQ(2, 400, "He directed 'Vertigo' (1958).", "Who is Alfred Hitchcock?"),
          mkQ(2, 600, "1972 Coppola epic.", "What is The Godfather?"),
          mkQ(2, 800, "Kubrick's odyssey from 1968.", "What is 2001: A Space Odyssey?"),
          mkQ(2, 1000, "Akira Kurosawa's 1954 film inspired 'The Magnificent Seven'.", "What is Seven Samurai?"),
        ],
      },
      {
        id: `c-${Math.random().toString(36).slice(2, 8)}`,
        title: "Science!",
        questions: [
          mkQ(3, 200, "H₂O.", "What is water?"),
          mkQ(3, 400, "Particle with no electric charge in the nucleus.", "What is a neutron?"),
          mkQ(3, 600, "Galaxy we live in.", "What is the Milky Way?"),
          mkQ(3, 800, "The chemical symbol Fe stands for this.", "What is iron?"),
          mkQ(3, 1000, "Equation E = m c².", "What is mass–energy equivalence?"),
        ],
      },
      {
        id: `c-${Math.random().toString(36).slice(2, 8)}`,
        title: "Video Games",
        questions: [
          mkQ(4, 200, "Nintendo plumber in red.", "Who is Mario?"),
          mkQ(4, 400, "Hero of Hyrule.", "Who is Link?"),
          mkQ(4, 600, "Valve's portal-gun protagonist.", "Who is Chell?"),
          mkQ(4, 800, "Cyberpunk franchise featuring 'V' in Night City.", "What is Cyberpunk 2077?"),
          mkQ(4, 1000, "FromSoftware's 2022 GOTY with horseback combat.", "What is Elden Ring?"),
        ],
      },
      {
        id: `c-${Math.random().toString(36).slice(2, 8)}`,
        title: "Potpourri",
        questions: [
          mkQ(5, 200, "Number of players on a basketball team on the court.", "What is 5?"),
          mkQ(5, 400, "This fruit has its seeds on the outside.", "What is a strawberry?"),
          mkQ(5, 600, "Currency of Japan.", "What is the yen?"),
          mkQ(5, 800, "Author of 'The Hobbit'.", "Who is J.R.R. Tolkien?"),
          mkQ(5, 1000, "Only even prime number.", "What is 2?"),
        ],
      },
    ],
    final: {
      id: `final-${Math.random().toString(36).slice(2, 8)}`,
      prompt:
        "This ancient wonder stood on the Greek island of Rhodes and was destroyed by an earthquake in 226 BC.",
      answer: "What is the Colossus of Rhodes?",
      value: 0,
    },
  };
}
